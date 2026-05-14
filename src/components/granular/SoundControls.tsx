import type { Sound } from "@/granular/types";
import { MAX_GRAIN_MS, MIN_GRAIN_MS } from "@/granular/types";
import { Slider } from "./Slider";
import { useTheme } from "@/theme/ThemeProvider";

export function SoundControls({
  sound,
  onChange,
  onRemap,
}: {
  sound: Sound;
  onChange: (patch: Partial<Sound>) => void;
  onRemap: () => void;
}) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  return (
    <div className="px-3 py-2 shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
        <h2
          className="truncate min-w-0 pr-2"
          style={{ fontSize: fs(10), fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.ink2 }}
          title={sound.name}
        >
          {sound.name}
        </h2>
        <button
          type="button"
          onClick={onRemap}
          className="rounded-full px-2.5 py-0.5 transition-opacity hover:opacity-60"
          style={{ fontSize: fs(10), border: "1px solid var(--border-mid)", color: "var(--ink-3)", background: "transparent" }}
        >
          remap
        </button>
      </div>
      <div className="grid grid-cols-5 gap-x-0.5 gap-y-2">
        <Slider
          label="Layers"
          min={1} max={24} step={1}
          value={sound.layers}
          onChange={(v) => onChange({ layers: v })}
          format={(v) => `${v}`}
          hue={sound.hue}
        />
        <Slider
          label="Grain"
          min={MIN_GRAIN_MS} max={MAX_GRAIN_MS} step={5}
          value={sound.grainMs}
          onChange={(v) => onChange({ grainMs: v })}
          format={(v) => `${v.toFixed(0)}ms`}
          hue={sound.hue}
        />
        <Slider
          label="Spread"
          min={0.05} max={0.5} step={0.01}
          value={sound.spread}
          onChange={(v) => onChange({ spread: v })}
          format={(v) => v.toFixed(2)}
          hue={sound.hue}
        />
        <Slider
          label="Pitch"
          min={0} max={1} step={0.01}
          value={sound.pitchJitter}
          onChange={(v) => onChange({ pitchJitter: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          hue={sound.hue}
        />
        <Slider
          label="Gain"
          min={0} max={4} step={0.01}
          value={sound.gain}
          onChange={(v) => onChange({ gain: v })}
          format={(v) => v.toFixed(2)}
          hue={sound.hue}
        />
      </div>
    </div>
  );
}
