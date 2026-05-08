import { Slider } from "./Slider";
import { useTheme } from "@/theme/ThemeProvider";

export function ReverbControls({
  grainMix,
  grainSize,
  grainDrive,
  onGrainMixChange,
  onGrainSizeChange,
  onGrainDriveChange,
  diffusionMix,
  diffusionSize,
  diffusionDrive,
  diffusionFeedback,
  diffusionDelayMs,
  onDiffusionMixChange,
  onDiffusionSizeChange,
  onDiffusionDriveChange,
  onDiffusionFeedbackChange,
  onDiffusionDelayMsChange,
  spectralMix,
  spectralSize,
  spectralDrive,
  onSpectralMixChange,
  onSpectralSizeChange,
  onSpectralDriveChange,
  layerMix,
  layerSize,
  layerDrive,
  onLayerMixChange,
  onLayerSizeChange,
  onLayerDriveChange,
  crystalLevel,
  onCrystalLevelChange,
  stretchFactor,
  onStretchChange,
  autoPlay,
  onAutoPlayToggle,
  autoDensity,
  onAutoDensityChange,
  isPalimpsestRecording,
  onStartPalimpsest,
  onStopPalimpsest,
  onClearPalimpsest,
  palimpsestLayerCount,
}: {
  grainMix: number;
  grainSize: number;
  grainDrive: number;
  onGrainMixChange: (v: number) => void;
  onGrainSizeChange: (v: number) => void;
  onGrainDriveChange: (v: number) => void;
  diffusionMix: number;
  diffusionSize: number;
  diffusionDrive: number;
  diffusionFeedback: number;
  diffusionDelayMs: number;
  onDiffusionMixChange: (v: number) => void;
  onDiffusionSizeChange: (v: number) => void;
  onDiffusionDriveChange: (v: number) => void;
  onDiffusionFeedbackChange: (v: number) => void;
  onDiffusionDelayMsChange: (v: number) => void;
  spectralMix: number;
  spectralSize: number;
  spectralDrive: number;
  onSpectralMixChange: (v: number) => void;
  onSpectralSizeChange: (v: number) => void;
  onSpectralDriveChange: (v: number) => void;
  layerMix: number;
  layerSize: number;
  layerDrive: number;
  onLayerMixChange: (v: number) => void;
  onLayerSizeChange: (v: number) => void;
  onLayerDriveChange: (v: number) => void;
  crystalLevel: number;
  onCrystalLevelChange: (v: number) => void;
  stretchFactor: number;
  onStretchChange: (v: number) => void;
  autoPlay: boolean;
  onAutoPlayToggle: () => void;
  autoDensity: number;
  onAutoDensityChange: (v: number) => void;
  isPalimpsestRecording: boolean;
  onStartPalimpsest: () => void;
  onStopPalimpsest: () => void;
  onClearPalimpsest: () => void;
  palimpsestLayerCount: number;
}) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  return (
    <div className="glass-panel px-3 py-2 space-y-2 shrink-0 mx-2 mb-2 rounded-lg" style={{ borderTop: `1px solid ${theme.colors.border}` }}>
      {/* Bus A */}
      <p style={{ fontSize: fs(10), fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.ink2 }}>moving grains</p>
      <div className="grid grid-cols-5 gap-x-0.5 gap-y-2">
        <Slider label="Mix"   min={0} max={1}   step={0.01} value={grainMix}   onChange={onGrainMixChange}   format={(v) => `${Math.round(v * 100)}%`}         hue={260} />
        <Slider label="Size"  min={0} max={1}   step={0.01} value={grainSize}  onChange={onGrainSizeChange}  format={(v) => `${Math.round(v * 100)}%`}         hue={260} />
        <Slider label="Drive" min={0} max={0.8} step={0.01} value={grainDrive} onChange={onGrainDriveChange} format={(v) => `${Math.round((v/0.8)*100)}%`}     hue={200} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAutoPlayToggle}
          className="rounded-full px-3 py-1 transition-all"
          style={{
            fontSize: fs(11),
            border: autoPlay ? `1px solid ${theme.colors.accent}80` : `1px solid ${theme.colors.borderMid}`,
            color: autoPlay ? "#b83e10" : theme.colors.ink2,
            background: autoPlay ? `${theme.colors.accent}19` : "transparent",
          }}
        >
          {autoPlay ? "stop auto" : "auto play"}
        </button>
        <div className="flex-1">
          <Slider
            label="Density"
            min={0.5}
            max={20}
            step={0.5}
            value={autoDensity}
            onChange={onAutoDensityChange}
            format={(v) => `${v.toFixed(1)}/s`}
            hue={35}
          />
        </div>
      </div>

      {/* Bus B */}
      <p style={{ fontSize: fs(10), fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.ink2, paddingTop: 4, borderTop: `1px solid ${theme.colors.border}` }}>diffusion agent</p>
      <div className="grid grid-cols-5 gap-x-0.5 gap-y-2">
        <Slider label="Reverb" min={0}  max={1}   step={0.01} value={diffusionMix}      onChange={onDiffusionMixChange}      format={(v) => `${Math.round(v * 100)}%`}     hue={310} />
        <Slider label="Room"   min={0}  max={1}   step={0.01} value={diffusionSize}     onChange={onDiffusionSizeChange}     format={(v) => `${Math.round(v * 100)}%`}     hue={310} />
        <Slider label="Drive"  min={0}  max={0.8} step={0.01} value={diffusionDrive}    onChange={onDiffusionDriveChange}    format={(v) => `${Math.round((v/0.8)*100)}%`} hue={280} />
        <Slider label="Fdbk"   min={0}  max={0.8} step={0.01} value={diffusionFeedback} onChange={onDiffusionFeedbackChange} format={(v) => `${Math.round((v/0.8)*100)}%`} hue={340} />
        <Slider label="Delay"  min={30} max={600} step={5}    value={diffusionDelayMs}  onChange={onDiffusionDelayMsChange}  format={(v) => `${Math.round(v)}ms`}          hue={180} />
      </div>

      {/* Spectral freeze */}
      <p style={{ fontSize: fs(10), fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.ink2, paddingTop: 4, borderTop: `1px solid ${theme.colors.border}` }}>spectral freeze</p>
      <div className="grid grid-cols-5 gap-x-0.5 gap-y-2">
        <Slider label="Rev"   min={0} max={1}   step={0.01} value={spectralMix}   onChange={onSpectralMixChange}   format={(v) => `${Math.round(v * 100)}%`} hue={200} />
        <Slider label="Room"  min={0} max={1}   step={0.01} value={spectralSize}  onChange={onSpectralSizeChange}  format={(v) => `${Math.round(v * 100)}%`} hue={200} />
        <Slider label="Drive" min={0} max={0.8} step={0.01} value={spectralDrive} onChange={onSpectralDriveChange} format={(v) => `${Math.round((v / 0.8) * 100)}%`} hue={200} />
      </div>
      <div className="flex items-center gap-2">
        <Slider
          label="Level"
          min={0} max={3.0} step={0.05}
          value={crystalLevel}
          onChange={onCrystalLevelChange}
          format={(v) => v < 0.01 ? "off" : `${v.toFixed(1)}×`}
          hue={200}
        />
        <p className="leading-snug flex-1" style={{ fontSize: fs(11), color: theme.colors.ink3, lineHeight: 1.6 }}>
          press <kbd style={{ padding: "0 3px", borderRadius: 2, border: `1px solid ${theme.colors.borderMid}`, fontFamily: "var(--font-mono)", fontSize: fs(10) }}>F</kbd> to
          crystallise — click to dissolve
        </p>
      </div>

      {/* Time stretch */}
      <p style={{ fontSize: fs(10), fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.colors.ink2, paddingTop: 4, borderTop: `1px solid ${theme.colors.border}` }}>time stretch</p>
      <div className="grid grid-cols-5 gap-x-0.5 gap-y-2">
        <Slider label="Rev"   min={0} max={1}   step={0.01} value={layerMix}   onChange={onLayerMixChange}   format={(v) => `${Math.round(v * 100)}%`} hue={150} />
        <Slider label="Room"  min={0} max={1}   step={0.01} value={layerSize}  onChange={onLayerSizeChange}  format={(v) => `${Math.round(v * 100)}%`} hue={150} />
        <Slider label="Drive" min={0} max={0.8} step={0.01} value={layerDrive} onChange={onLayerDriveChange} format={(v) => `${Math.round((v / 0.8) * 100)}%`} hue={150} />
      </div>
      <div className="flex items-center gap-2">
        <Slider
          label="Stretch"
          min={0.01} max={1.0} step={0.01}
          value={stretchFactor}
          onChange={onStretchChange}
          format={(v) => v >= 0.99 ? "off" : `${Math.round(1/v)}×`}
          hue={150}
        />
        <p className="leading-snug flex-1" style={{ fontSize: fs(11), color: theme.colors.ink3, lineHeight: 1.6 }}>
          speech dissolves into vowel pads / drag up = short, down = long
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!isPalimpsestRecording ? (
          <button
            type="button"
            onClick={onStartPalimpsest}
            className="rounded-full px-3 py-1 transition-opacity"
            style={{ fontSize: fs(11), border: `1px solid ${theme.colors.ink2}59`, color: theme.colors.ink2, background: `${theme.colors.ink2}12` }}
          >
            ◈ layer
          </button>
        ) : (
          <button
            type="button"
            onClick={onStopPalimpsest}
            className="rounded-full px-3 py-1 animate-pulse"
            style={{ fontSize: fs(11), border: `1px solid ${theme.colors.ink2}8c`, color: "#003d6b", background: `${theme.colors.ink2}1f` }}
          >
            ⏹ stop layer
          </button>
        )}
        <span style={{ fontSize: fs(10), color: theme.colors.ink3 }}>layers: {palimpsestLayerCount}</span>
        {palimpsestLayerCount > 0 && (
          <button
            type="button"
            onClick={onClearPalimpsest}
            className="transition-opacity hover:opacity-60"
            style={{ fontSize: fs(12), color: theme.colors.ink3 }}
            title="Clear all palimpsest layers"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
