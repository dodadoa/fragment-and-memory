import { Slider } from "./Slider";
import { useTheme } from "@/theme/ThemeProvider";

export function ReverbControls({
  grainMix,
  grainSize,
  grainDrive,
  grainOutputLevel,
  onGrainMixChange,
  onGrainSizeChange,
  onGrainDriveChange,
  onGrainOutputLevelChange,
  diffusionMix,
  diffusionSize,
  diffusionDrive,
  diffusionOutputLevel,
  diffusionFeedback,
  diffusionDelayMs,
  onDiffusionMixChange,
  onDiffusionSizeChange,
  onDiffusionDriveChange,
  onDiffusionOutputLevelChange,
  onDiffusionFeedbackChange,
  onDiffusionDelayMsChange,
  spectralMix,
  spectralSize,
  spectralDrive,
  spectralOutputLevel,
  onSpectralMixChange,
  onSpectralSizeChange,
  onSpectralDriveChange,
  onSpectralOutputLevelChange,
  crystalLevel,
  onCrystalLevelChange,
  autoPlay,
  onAutoPlayToggle,
  autoDensity,
  onAutoDensityChange,
}: {
  grainMix: number;
  grainSize: number;
  grainDrive: number;
  grainOutputLevel: number;
  onGrainMixChange: (v: number) => void;
  onGrainSizeChange: (v: number) => void;
  onGrainDriveChange: (v: number) => void;
  onGrainOutputLevelChange: (v: number) => void;
  diffusionMix: number;
  diffusionSize: number;
  diffusionDrive: number;
  diffusionOutputLevel: number;
  diffusionFeedback: number;
  diffusionDelayMs: number;
  onDiffusionMixChange: (v: number) => void;
  onDiffusionSizeChange: (v: number) => void;
  onDiffusionDriveChange: (v: number) => void;
  onDiffusionOutputLevelChange: (v: number) => void;
  onDiffusionFeedbackChange: (v: number) => void;
  onDiffusionDelayMsChange: (v: number) => void;
  spectralMix: number;
  spectralSize: number;
  spectralDrive: number;
  spectralOutputLevel: number;
  onSpectralMixChange: (v: number) => void;
  onSpectralSizeChange: (v: number) => void;
  onSpectralDriveChange: (v: number) => void;
  onSpectralOutputLevelChange: (v: number) => void;
  crystalLevel: number;
  onCrystalLevelChange: (v: number) => void;
  autoPlay: boolean;
  onAutoPlayToggle: () => void;
  autoDensity: number;
  onAutoDensityChange: (v: number) => void;
}) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  const ttMix = "Dry vs wet for this bus (constant-power pan).";
  const ttSat = "How hard the signal drives the reverb matrix (internal saturation). Not output loudness — use Level.";
  const ttLevel = "This bus’s output level at the speakers (after Mix).";
  const sectionHeader = (label: string) => (
    <div className="px-3 py-1" style={{ background: "rgba(0,0,0,0.06)", borderTop: `1px solid ${theme.colors.border}` }}>
      <span style={{ fontSize: fs(9), fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.colors.ink3 }}>{label}</span>
    </div>
  );

  return (
    <div style={{ font: "inherit" }}>
      {/* Bus A — Moving grains */}
      {sectionHeader("moving grains")}
      <div className="px-3 py-2 space-y-2" style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
        <div className="grid grid-cols-4 gap-x-0.5 gap-y-2">
          <Slider label="Mix"   min={0} max={1}   step={0.01} value={grainMix}   onChange={onGrainMixChange}   format={(v) => `${Math.round(v * 100)}%`}         hue={260} title={ttMix} />
          <Slider label="Size"  min={0} max={1}   step={0.01} value={grainSize}  onChange={onGrainSizeChange}  format={(v) => `${Math.round(v * 100)}%`}         hue={260} />
          <Slider label="Sat"   min={0} max={0.8} step={0.01} value={grainDrive} onChange={onGrainDriveChange} format={(v) => `${Math.round((v/0.8)*100)}%`}     hue={200} title={ttSat} />
          <Slider label="Level" min={0} max={1.5} step={0.01} value={grainOutputLevel} onChange={onGrainOutputLevelChange} format={(v) => `${v.toFixed(2)}×`} hue={260} title={ttLevel} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAutoPlayToggle}
            className="rounded-full px-3 py-1 transition-all"
            style={{
              fontSize: fs(11),
              border: `1px solid ${theme.colors.borderMid}`,
              color: theme.colors.ink1,
              background: autoPlay ? "rgba(0,0,0,0.07)" : "transparent",
            }}
          >
            {autoPlay ? "stop auto" : "auto play"}
          </button>
          <div className="flex-1">
            <Slider label="Density" min={0.5} max={20} step={0.5} value={autoDensity} onChange={onAutoDensityChange} format={(v) => `${v.toFixed(1)}/s`} hue={35} />
          </div>
        </div>
      </div>

      {/* Bus B — Diffusion agent */}
      {sectionHeader("diffusion agent")}
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-0.5 gap-y-2">
          <Slider label="Reverb" min={0}  max={1}   step={0.01} value={diffusionMix}      onChange={onDiffusionMixChange}      format={(v) => `${Math.round(v * 100)}%`}     hue={310} title={ttMix} />
          <Slider label="Room"   min={0}  max={1}   step={0.01} value={diffusionSize}     onChange={onDiffusionSizeChange}     format={(v) => `${Math.round(v * 100)}%`}     hue={310} />
          <Slider label="Sat"    min={0}  max={0.8} step={0.01} value={diffusionDrive}    onChange={onDiffusionDriveChange}    format={(v) => `${Math.round((v/0.8)*100)}%`} hue={280} title={ttSat} />
          <Slider label="Level"  min={0}  max={1.5} step={0.01} value={diffusionOutputLevel} onChange={onDiffusionOutputLevelChange} format={(v) => `${v.toFixed(2)}×`} hue={310} title={ttLevel} />
          <Slider label="Fdbk"   min={0}  max={0.8} step={0.01} value={diffusionFeedback} onChange={onDiffusionFeedbackChange} format={(v) => `${Math.round((v/0.8)*100)}%`} hue={340} />
          <Slider label="Delay"  min={30} max={600} step={5}    value={diffusionDelayMs}  onChange={onDiffusionDelayMsChange}  format={(v) => `${Math.round(v)}ms`}          hue={180} />
        </div>
      </div>

      {/* Bus C — Spectral freeze */}
      {sectionHeader("spectral freeze")}
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
        <div className="grid grid-cols-4 gap-x-0.5 gap-y-2">
          <Slider label="Rev"   min={0} max={1}   step={0.01} value={spectralMix}   onChange={onSpectralMixChange}   format={(v) => `${Math.round(v * 100)}%`} hue={200} title={ttMix} />
          <Slider label="Room"  min={0} max={1}   step={0.01} value={spectralSize}  onChange={onSpectralSizeChange}  format={(v) => `${Math.round(v * 100)}%`} hue={200} />
          <Slider label="Sat"   min={0} max={0.8} step={0.01} value={spectralDrive} onChange={onSpectralDriveChange} format={(v) => `${Math.round((v / 0.8) * 100)}%`} hue={200} title={ttSat} />
          <Slider label="Level" min={0} max={1.5} step={0.01} value={spectralOutputLevel} onChange={onSpectralOutputLevelChange} format={(v) => `${v.toFixed(2)}×`} hue={200} title={ttLevel} />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Slider label="Crystal" min={0} max={3.0} step={0.05} value={crystalLevel} onChange={onCrystalLevelChange} format={(v) => v < 0.01 ? "off" : `${v.toFixed(1)}×`} hue={200} />
          <p className="leading-snug flex-1" style={{ fontSize: fs(10), color: theme.colors.ink3, lineHeight: 1.5 }}>
            <kbd style={{ padding: "0 3px", border: `1px solid ${theme.colors.borderMid}`, fontFamily: "var(--font-mono)", fontSize: fs(9) }}>F</kbd> freeze · click dissolve
          </p>
        </div>
      </div>
    </div>
  );
}
