import type { PalimpsestLayer } from "@/granular/types";
import { MAX_PALIMPSEST_LAYERS } from "@/granular/types";
import { Slider } from "./Slider";
import { useTheme } from "@/theme/ThemeProvider";

function seedFrom(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

// Simple horizontal waveform path across a 200×40 viewBox
function scopePath(id: string, durationMs: number, decay: number): string {
  const seed = seedFrom(id);
  const d = Math.max(0.05, decay);
  const lenScale = Math.min(1, 0.35 + (durationMs / 9000) * 0.65);
  const amp = 18 * (0.18 + 0.82 * d) * lenScale;
  const ph = (seed % 1200) * 0.001;
  const n = 120;
  let path = "";
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 200;
    const t = (i / n) * Math.PI * 5.8 + durationMs * 0.0003;
    const y =
      20 +
      amp * (
        0.42 * Math.sin(t * 2.1 + ph) +
        0.26 * Math.sin(t * 4.9 - ph * 1.6) +
        0.18 * Math.sin(t * 9.4 + seed * 0.013) +
        0.14 * Math.sin(t * 17  + ph * 2.8) * d
      );
    path += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(2)}`;
  }
  return path;
}

export function StackingMemoryPanel({
  layers,
  isRecording,
  layerOutputLevel,
  onLayerOutputLevelChange,
  layerMix,
  layerSize,
  layerDrive,
  onLayerMixChange,
  onLayerSizeChange,
  onLayerDriveChange,
  onStartRecording,
  onStopRecording,
  onClear,
  onSaveToFile,
  isExporting,
  disabled,
}: {
  layers: PalimpsestLayer[];
  isRecording: boolean;
  layerOutputLevel: number;
  onLayerOutputLevelChange: (v: number) => void;
  layerMix: number;
  layerSize: number;
  layerDrive: number;
  onLayerMixChange: (v: number) => void;
  onLayerSizeChange: (v: number) => void;
  onLayerDriveChange: (v: number) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClear: () => void;
  onSaveToFile: () => void;
  isExporting: boolean;
  disabled: boolean;
}) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;

  return (
    <aside
      className="glass-panel flex flex-col w-full lg:w-52 shrink-0 rounded-xl overflow-hidden"
      aria-label="Stacking memory"
    >
      {/* Header */}
      <div
        className="px-3 py-1 shrink-0 flex items-center justify-between gap-2"
        style={{ background: "rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 rounded-full transition-all duration-300"
            style={{
              width: 6,
              height: 6,
              background: isRecording ? theme.colors.ink1 : theme.colors.borderMid,
              animation: isRecording ? "stacking-pin-pulse 1.2s ease-in-out infinite" : undefined,
            }}
          />
          <h2
            className="truncate"
            style={{
              fontSize: fs(9),
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: theme.colors.ink3,
            }}
          >
            stacking memory
          </h2>
        </div>
        <span className="tabular-nums shrink-0" style={{ fontSize: fs(9), color: theme.colors.ink4 }}>
          {layers.length}/{MAX_PALIMPSEST_LAYERS}
        </span>
      </div>

      {/* Waveform scope — all layers overlaid, oldest behind, newest on top */}
      <div className="px-3 pt-2 pb-1 shrink-0">
        <div
          className="relative w-full rounded overflow-hidden"
          style={{
            height: 72,
            background: "rgba(0,0,0,0.04)",
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <svg
            viewBox="0 0 200 40"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            aria-hidden
          >
            {/* centre line */}
            <line x1="0" y1="20" x2="200" y2="20" stroke={theme.colors.border} strokeWidth="0.5" />

            {disabled || (layers.length === 0 && !isRecording) ? (
              /* idle flat line */
              <line x1="0" y1="20" x2="200" y2="20" stroke={theme.colors.borderMid} strokeWidth="0.6" strokeDasharray="4,5" />
            ) : (
              layers.map((layer) => {
                const d = Math.max(0.04, layer.decayLevel);
                const blurPx = (1 - d) * 0.9;
                const op = 0.14 + d * 0.76;
                return (
                  <path
                    key={layer.id}
                    d={scopePath(layer.id, layer.duration, d)}
                    fill="none"
                    stroke={`hsla(${layer.hue}, 65%, 42%, ${op})`}
                    strokeWidth={0.55}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: blurPx > 0.15 ? `blur(${blurPx.toFixed(2)}px)` : undefined }}
                  />
                );
              })
            )}
          </svg>
        </div>

        {/* empty hint */}
        {!disabled && layers.length === 0 && !isRecording && (
          <p className="mt-1.5 text-center" style={{ fontSize: fs(9), color: theme.colors.ink4 }}>
            press{" "}
            <kbd
              style={{
                padding: "0 4px",
                borderRadius: 2,
                border: `1px solid ${theme.colors.borderMid}`,
                fontFamily: theme.font.mono,
                fontSize: fs(8),
                color: theme.colors.ink3,
              }}
            >
              R
            </kbd>{" "}
            to record
          </p>
        )}
      </div>

      {/* Bus controls */}
      <div className="shrink-0" style={{ borderTop: `1px solid ${theme.colors.border}` }}>
        <div className="px-3 py-1" style={{ background: "rgba(0,0,0,0.06)" }}>
          <span style={{ fontSize: fs(9), fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.colors.ink3 }}>bus</span>
        </div>
        <div className="px-3 py-2">
        <div className="grid grid-cols-3 gap-x-1">
          <Slider label="Rev"  min={0} max={1}   step={0.01} value={layerMix}   onChange={onLayerMixChange}   format={(v) => `${Math.round(v * 100)}%`} hue={150} title="Reverb mix for the stack bus" />
          <Slider label="Room" min={0} max={1}   step={0.01} value={layerSize}  onChange={onLayerSizeChange}  format={(v) => `${Math.round(v * 100)}%`} hue={150} title="Reverb room size" />
          <Slider label="Sat"  min={0} max={0.8} step={0.01} value={layerDrive} onChange={onLayerDriveChange} format={(v) => `${Math.round((v / 0.8) * 100)}%`} hue={150} title="Internal saturation drive" />
        </div>
        </div>
      </div>

      {/* Controls — all in one row */}
      <div
        className="px-3 py-2 shrink-0 flex items-center gap-2"
        style={{ borderTop: `1px solid ${theme.colors.border}` }}
      >
        {/* Record / Stop */}
        <button
          type="button"
          disabled={disabled}
          onClick={isRecording ? onStopRecording : onStartRecording}
          className="rounded-full px-2.5 py-0.5 shrink-0 transition-opacity disabled:opacity-35"
          style={{
            fontSize: fs(10),
            letterSpacing: "0.04em",
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.ink1,
            background: isRecording ? "rgba(0,0,0,0.08)" : "transparent",
          }}
        >
          {isRecording ? "stop" : "rec"}
        </button>

        {/* Level slider — fills remaining space */}
        <div className="flex-1 min-w-0">
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

        {/* R hint */}
        <kbd
          style={{
            padding: "1px 4px",
            borderRadius: 2,
            border: `1px solid ${theme.colors.borderMid}`,
            fontFamily: theme.font.mono,
            fontSize: fs(8),
            color: theme.colors.ink4,
          }}
          title="Press R to arm / record / stack"
        >
          R
        </kbd>

        {/* Save */}
        <button
          type="button"
          disabled={disabled || layers.length === 0 || isExporting}
          onClick={onSaveToFile}
          className="shrink-0 transition-opacity hover:opacity-60 disabled:opacity-25"
          style={{ fontSize: fs(9), color: theme.colors.ink4 }}
          title="Save stack memory mix to file"
        >
          {isExporting ? "…" : "save"}
        </button>

        {/* Clear */}
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
    </aside>
  );
}
