import type { Sound } from "@/granular/types";
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
    <div className="border-b" style={{ borderColor: "var(--border)" }}>
      <div className="px-3 py-1 flex items-center justify-between gap-2" style={{ background: "rgba(0,0,0,0.06)" }}>
        <p
          className="truncate min-w-0"
          style={{ fontSize: fs(9), fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.colors.ink3 }}
          title={sound.name}
        >
          {sound.name}
        </p>
        <button
          type="button"
          onClick={onRemap}
          className="shrink-0 transition-opacity hover:opacity-60"
          style={{ fontSize: fs(9), color: theme.colors.ink4, background: "transparent", border: "none" }}
        >
          remap
        </button>
      </div>
      <div className="px-3 py-2">
      <div className="grid grid-cols-3 gap-x-1 gap-y-2">
        <Slider
          label="Size"
          min={20} max={2000} step={5}
          value={sound.grainMs}
          onChange={(v) => onChange({ grainMs: v })}
          format={(v) => `${v.toFixed(0)}ms`}
          hue={sound.hue}
          title="Grain size for this sound"
        />
        <Slider
          label="Pitch"
          min={0} max={1} step={0.01}
          value={sound.pitchJitter}
          onChange={(v) => onChange({ pitchJitter: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          hue={sound.hue}
          title="Random pitch jitter for this sound"
        />
        <Slider
          label="Gain"
          min={0} max={4} step={0.01}
          value={sound.gain}
          onChange={(v) => onChange({ gain: v })}
          format={(v) => v.toFixed(2)}
          hue={sound.hue}
          title="Grain gain for this sound"
        />
      </div>
      </div>
    </div>
  );
}
