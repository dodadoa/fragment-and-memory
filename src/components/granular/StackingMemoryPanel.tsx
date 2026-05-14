import type { PalimpsestLayer } from "@/granular/types";
import { MAX_PALIMPSEST_LAYERS } from "@/granular/types";
import { Slider } from "./Slider";
import { useTheme } from "@/theme/ThemeProvider";

function seedFrom(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

function scopeWavePath(id: string, durationMs: number, decay: number): string {
  const w = 200;
  const h = 32;
  const seed = seedFrom(id);
  const d = Math.max(0.05, decay);
  const lenBoost = Math.min(1, 0.45 + (durationMs / 9000) * 0.55);
  const amp = h * 0.38 * (0.22 + 0.78 * d) * lenBoost;
  const cy = h / 2;
  const n = 72;
  const ph = (seed % 1200) * 0.001;
  let dpath = "";
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const u = (i / n) * Math.PI * 5.5 + durationMs * 0.00035;
    const y =
      cy +
      amp *
        (0.4 * Math.sin(u * 2.05 + ph) +
          0.28 * Math.sin(u * 4.7 - ph * 1.7) +
          0.2 * Math.sin(u * 9.2 + seed * 0.015) +
          0.12 * Math.sin(u * 16 + ph * 3) * d +
          (((seed >> (i % 9)) & 3) - 1.5) * 0.06);
    dpath += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(2)}`;
  }
  return dpath;
}

export function StackingMemoryPanel({
  layers,
  isRecording,
  layerOutputLevel,
  onLayerOutputLevelChange,
  onStartRecording,
  onStopRecording,
  onClear,
  disabled,
}: {
  layers: PalimpsestLayer[];
  isRecording: boolean;
  layerOutputLevel: number;
  onLayerOutputLevelChange: (v: number) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;

  return (
    <aside
      className="glass-panel flex flex-col flex-1 min-h-0 w-full lg:w-[15rem] lg:flex-none lg:self-stretch rounded-xl overflow-hidden"
      aria-label="Stacking memory"
    >
      {/* Header */}
      <div
        className="px-3 pt-3 pb-2 shrink-0 flex items-center justify-between gap-2"
        style={{ borderBottom: `1px solid ${theme.colors.border}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Record indicator dot */}
          <span
            className="shrink-0 rounded-full transition-all duration-300"
            style={{
              width: 7,
              height: 7,
              background: isRecording ? "#c84040" : theme.colors.borderMid,
              boxShadow: isRecording ? "0 0 0 2px rgba(200,64,64,0.18), 0 0 8px rgba(200,64,64,0.32)" : "none",
              animation: isRecording ? "stacking-pin-pulse 1.2s ease-in-out infinite" : undefined,
            }}
          />
          <h2
            className="truncate"
            style={{
              fontSize: fs(10),
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: theme.colors.ink2,
            }}
          >
            stacking memory
          </h2>
        </div>
        <span className="tabular-nums shrink-0" style={{ fontSize: fs(9), color: theme.colors.ink4 }}>
          {layers.length}/{MAX_PALIMPSEST_LAYERS}
        </span>
      </div>

      {/* Stack view — grows to fill remaining height */}
      <div className="flex flex-1 flex-col min-h-0 px-3 pt-2 pb-1 gap-1">
        {disabled ? (
          <div className="flex flex-1 items-center justify-center">
            <span style={{ fontSize: fs(11), color: theme.colors.ink4 }}>load a sound</span>
          </div>
        ) : layers.length === 0 && !isRecording ? (
          <div className="flex flex-1 items-center justify-center text-center px-2">
            <span style={{ fontSize: fs(11), color: theme.colors.ink4, lineHeight: 1.55 }}>
              press{" "}
              <kbd
                style={{
                  padding: "1px 5px",
                  borderRadius: 3,
                  border: `1px solid ${theme.colors.borderMid}`,
                  fontFamily: theme.font.mono,
                  fontSize: fs(9),
                  color: theme.colors.ink3,
                }}
              >
                R
              </kbd>{" "}
              to record a pass
            </span>
          </div>
        ) : (
          /* layers: oldest first in array → rendered bottom-up via flex-col-reverse */
          <div className="flex flex-1 flex-col-reverse gap-[3px] min-h-0">
            {layers.map((layer, index) => {
              const d = Math.max(0.04, layer.decayLevel);
              const ghost = 1 - d;
              const isNewest = index === layers.length - 1;
              const blurPx = ghost * 1.1;
              const strokeOp = 0.18 + d * 0.72;
              const fillOp = 0.03 + d * 0.13;
              const path = scopeWavePath(layer.id, layer.duration, d);
              return (
                <div
                  key={layer.id}
                  className="relative flex-1 min-h-[12px] rounded"
                  style={{
                    filter: blurPx > 0.1 ? `blur(${blurPx.toFixed(2)}px)` : undefined,
                    opacity: Math.max(0.32, 0.2 + d * 0.78),
                    background: isNewest
                      ? `hsla(${layer.hue}, 28%, 82%, 0.18)`
                      : `hsla(${layer.hue}, 18%, 86%, ${0.06 + d * 0.1})`,
                    borderBottom: `1px solid hsla(${layer.hue}, 40%, 55%, ${0.08 + d * 0.14})`,
                  }}
                >
                  <svg
                    viewBox="0 0 200 32"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full"
                    aria-hidden
                  >
                    <defs>
                      <linearGradient id={`sf-${layer.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={`hsla(${layer.hue}, 60%, 42%, ${fillOp * 1.6})`} />
                        <stop offset="100%" stopColor={`hsla(${layer.hue}, 40%, 55%, ${fillOp * 0.3})`} />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${path} L 200,32 L 0,32 Z`}
                      fill={`url(#sf-${layer.id})`}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={`hsla(${layer.hue}, 65%, 40%, ${strokeOp})`}
                      strokeWidth={0.8 + d * 0.85}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {/* dissolve wash — adds coolness as layer ages */}
                  {ghost > 0.15 && (
                    <div
                      className="pointer-events-none absolute inset-0 rounded"
                      style={{
                        background: `linear-gradient(180deg, transparent 35%, rgba(210,220,230,${ghost * 0.18}) 100%)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
            {/* live scan line while recording */}
            {isRecording && (
              <div
                className="stacking-tape-scan pointer-events-none absolute inset-0 z-10 rounded"
                style={{
                  background: `linear-gradient(90deg,
                    transparent 0%,
                    rgba(200,64,64,0.06) 40%,
                    rgba(200,64,64,0.13) 50%,
                    rgba(200,64,64,0.06) 60%,
                    transparent 100%)`,
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Controls footer */}
      <div
        className="px-3 py-2 shrink-0 flex flex-col gap-2"
        style={{ borderTop: `1px solid ${theme.colors.border}` }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={isRecording ? onStopRecording : onStartRecording}
            className="rounded-full px-3 py-0.5 transition-opacity disabled:opacity-35"
            style={{
              fontSize: fs(11),
              letterSpacing: "0.04em",
              border: isRecording
                ? `1px solid rgba(200,64,64,0.55)`
                : `1px solid ${theme.colors.borderMid}`,
              color: isRecording ? "#a83030" : theme.colors.ink2,
              background: isRecording ? "rgba(200,64,64,0.08)" : "transparent",
            }}
          >
            {isRecording ? "stop" : "record"}
          </button>

          <Slider
            label="Level"
            min={0}
            max={1.5}
            step={0.01}
            value={layerOutputLevel}
            onChange={onLayerOutputLevelChange}
            format={(v) => `${v.toFixed(2)}×`}
            hue={32}
            title="Stack memory bus output level"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p style={{ fontSize: fs(9), color: theme.colors.ink4, lineHeight: 1.5 }}>
            <kbd
              style={{
                padding: "0 3px",
                borderRadius: 2,
                border: `1px solid ${theme.colors.borderMid}`,
                fontFamily: theme.font.mono,
                fontSize: fs(8),
              }}
            >
              R
            </kbd>{" "}
            arm · trigger · R again to stack
          </p>
          <button
            type="button"
            disabled={disabled || layers.length === 0}
            onClick={onClear}
            className="shrink-0 transition-opacity hover:opacity-60 disabled:opacity-25"
            style={{ fontSize: fs(9), color: theme.colors.ink4 }}
          >
            clear
          </button>
        </div>
      </div>
    </aside>
  );
}
