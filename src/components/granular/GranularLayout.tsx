import type { GranularViewModel } from "@/hooks/useGranularApp";
import { useTheme } from "@/theme/ThemeProvider";
import { Loader } from "./Loader";
import { NodeCanvas } from "./NodeCanvas";
import { ReverbControls } from "./ReverbControls";
import { SoundControls } from "./SoundControls";

import { useState } from "react";

export function GranularLayout(props: GranularViewModel) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  const [soundsExpanded, setSoundsExpanded] = useState(false);
  const {
    sounds,
    activeSoundId,
    setActiveSoundId,
    activeSound,
    isLoading,
    loadError,
    masterVolume,
    setMasterVolume,
    autoPlay,
    setAutoPlay,
    autoDensity,
    setAutoDensity,
    isLooping,
    isRecording,
    loopIteration,
    startRecording,
    stopRecording,
    clearLoop,
    reverbMix,
    setReverbMix,
    reverbSize,
    setReverbSize,
    reverbDrive,
    setReverbDrive,
    diffusionReverbMix,
    setDiffusionReverbMix,
    diffusionReverbSize,
    setDiffusionReverbSize,
    diffusionReverbDrive,
    setDiffusionReverbDrive,
    diffusionFeedback,
    setDiffusionFeedback,
    diffusionDelayMs,
    setDiffusionDelayMs,
    spectralReverbMix,
    setSpectralReverbMix,
    spectralReverbSize,
    setSpectralReverbSize,
    spectralReverbDrive,
    setSpectralReverbDrive,
    layerReverbMix,
    setLayerReverbMix,
    layerReverbSize,
    setLayerReverbSize,
    layerReverbDrive,
    setLayerReverbDrive,
    onFileInput,
    onDrop,
    updateAllSounds,
    remapAllSounds,
    removeSound,
    flash,
    traces,
    onNodeTrigger,
    playDiffusionGrain,
    onWallBounce,
    crystals,
    captureCrystal,
    removeCrystal,
    crystalLevel,
    setCrystalLevel,
    stretchFactor,
    setStretchFactor,
    palimpsestLayers,
    isPalimpsestRecording,
    startPalimpsestRecording,
    stopPalimpsestRecording,
    clearPalimpsest,
  } = props;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden w-full"
      style={{ color: theme.colors.ink1, fontFamily: theme.font.body }}
    >
      <header
        className="glass-panel-strong flex flex-wrap items-center justify-between gap-4 px-6 py-3 shrink-0 mx-2 mt-2 rounded-xl"
        style={{ borderBottom: `1px solid ${theme.colors.borderMid}` }}
      >
        <div>
          <h1
            className="leading-none"
            style={{ fontSize: fs(16), fontWeight: 700, letterSpacing: "0.08em", color: theme.colors.ink1 }}
          >
            LAYER WORD
          </h1>
          <p style={{ fontSize: fs(10), color: theme.colors.ink3, marginTop: 4, letterSpacing: "0.04em" }}>
            granular diffusion / walk the agent
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!isLooping && !isRecording && (
            <button
              type="button"
              onClick={startRecording}
              disabled={sounds.length === 0}
              className="rounded-full px-3 py-1 disabled:opacity-30 transition-opacity"
              style={{ fontSize: fs(11), letterSpacing: "0.04em", border: `1px solid ${theme.colors.accent}66`, color: "#cc4a18", background: `${theme.colors.accent}14` }}
            >
              ⏺ record
            </button>
          )}
          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="rounded-full px-3 py-1 animate-pulse"
              style={{ fontSize: fs(11), border: `1px solid ${theme.colors.accent}aa`, color: "#b83e10", background: `${theme.colors.accent}24` }}
            >
              ⏹ stop · recording
            </button>
          )}
          {isLooping && (
            <div className="flex items-center gap-2">
              <span
                style={{ fontSize: fs(11), color: theme.colors.ink2, opacity: Math.max(0.3, 1 - loopIteration * 0.1) }}
              >
                loop ×{loopIteration + 1}{loopIteration >= 5 ? " · fading…" : ""}
              </span>
              <button
                type="button"
                onClick={clearLoop}
                className="rounded-full px-3 py-1 transition-opacity hover:opacity-70"
                style={{ fontSize: fs(11), border: `1px solid ${theme.colors.borderMid}`, color: theme.colors.ink2, background: "transparent" }}
              >
                ✕ clear
              </button>
            </div>
          )}
          <div style={{ width: 1, height: 18, background: theme.colors.borderMid }} />
          <label className="flex items-center gap-2" style={{ fontSize: fs(11), color: theme.colors.ink3 }}>
            master
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="w-24"
              style={{ accentColor: "var(--accent)" }}
            />
          </label>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <aside
          className="glass-panel sidebar-scroll w-full lg:w-64 flex flex-col overflow-y-auto shrink-0 rounded-xl m-2 mr-1"
          style={{ borderRight: `1px solid ${theme.colors.borderMid}` }}
        >
          <Loader isLoading={isLoading} error={loadError} onFileInput={onFileInput} onDrop={onDrop} />
          <div className="flex-1">
            {sounds.length === 0 ? (
              <p className="p-4" style={{ fontSize: fs(11), color: theme.colors.ink3 }}>
                no sounds loaded — drop a file above to begin
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSoundsExpanded((v) => !v)}
                  className="w-full text-left px-3 py-1.5 border-b transition-opacity hover:opacity-80"
                  style={{ borderColor: theme.colors.border, background: "rgba(255,255,255,0.14)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate" style={{ fontSize: fs(10), color: theme.colors.ink2 }}>
                      {activeSound?.name ?? sounds[0]?.name} · {sounds.length} sound{sounds.length > 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: fs(10), color: theme.colors.ink3 }}>
                      {soundsExpanded ? "▾" : "▸"}
                    </span>
                  </div>
                </button>
                {soundsExpanded && (
              <ul>
                {sounds.map((sound) => (
                  <li
                    key={sound.id}
                    className="cursor-pointer transition-all"
                    style={{
                      padding: "5px 10px",
                      borderBottom: `1px solid ${theme.colors.border}`,
                      background: activeSoundId === sound.id ? `${theme.colors.ink2}08` : "transparent",
                    }}
                    onClick={() => setActiveSoundId(sound.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{
                            background: sound.color,
                            boxShadow: `0 0 8px ${sound.color}88, 0 0 20px ${sound.color}44`,
                          }}
                        />
                        <span className="truncate" style={{ fontSize: fs(11), fontWeight: 700, color: "var(--ink-1)" }}>{sound.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeSound(sound.id); }}
                        className="transition-opacity hover:opacity-60"
                        style={{ fontSize: fs(10), color: theme.colors.ink3 }}
                        aria-label={`Remove ${sound.name}`}
                      >
                        ✕
                      </button>
                    </div>
                    <p className="mt-0.5 tabular-nums" style={{ fontSize: fs(9), color: theme.colors.ink3 }}>
                      {sound.buffer.duration.toFixed(2)}s · {sound.layers} layers · {sound.nodes.length} nodes
                    </p>
                  </li>
                ))}
              </ul>
                )}
              </>
            )}
          </div>
          {sounds.length > 0 ? (
            <>
              <SoundControls
                sound={activeSound ?? sounds[0]}
                onChange={updateAllSounds}
                onRemap={remapAllSounds}
              />
              <ReverbControls
                grainMix={reverbMix}
                grainSize={reverbSize}
                grainDrive={reverbDrive}
                onGrainMixChange={setReverbMix}
                onGrainSizeChange={setReverbSize}
                onGrainDriveChange={setReverbDrive}
                diffusionMix={diffusionReverbMix}
                diffusionSize={diffusionReverbSize}
                diffusionDrive={diffusionReverbDrive}
                diffusionFeedback={diffusionFeedback}
                diffusionDelayMs={diffusionDelayMs}
                onDiffusionMixChange={setDiffusionReverbMix}
                onDiffusionSizeChange={setDiffusionReverbSize}
                onDiffusionDriveChange={setDiffusionReverbDrive}
                onDiffusionFeedbackChange={setDiffusionFeedback}
                onDiffusionDelayMsChange={setDiffusionDelayMs}
                spectralMix={spectralReverbMix}
                spectralSize={spectralReverbSize}
                spectralDrive={spectralReverbDrive}
                onSpectralMixChange={setSpectralReverbMix}
                onSpectralSizeChange={setSpectralReverbSize}
                onSpectralDriveChange={setSpectralReverbDrive}
                layerMix={layerReverbMix}
                layerSize={layerReverbSize}
                layerDrive={layerReverbDrive}
                onLayerMixChange={setLayerReverbMix}
                onLayerSizeChange={setLayerReverbSize}
                onLayerDriveChange={setLayerReverbDrive}
                crystalLevel={crystalLevel}
                onCrystalLevelChange={setCrystalLevel}
                stretchFactor={stretchFactor}
                onStretchChange={setStretchFactor}
                autoPlay={autoPlay}
                onAutoPlayToggle={() => setAutoPlay((v) => !v)}
                autoDensity={autoDensity}
                onAutoDensityChange={setAutoDensity}
                isPalimpsestRecording={isPalimpsestRecording}
                onStartPalimpsest={startPalimpsestRecording}
                onStopPalimpsest={stopPalimpsestRecording}
                onClearPalimpsest={clearPalimpsest}
                palimpsestLayerCount={palimpsestLayers.length}
              />
            </>
          ) : null}
        </aside>

        <main
          className="glass-panel flex-1 relative overflow-hidden rounded-xl m-2 ml-1"
          style={{ background: "rgba(255,255,255,0.16)" }}
        >
          <NodeCanvas
            sounds={sounds}
            activeSoundId={activeSoundId}
            flash={flash}
            traces={traces}
            onTrigger={onNodeTrigger}
            onDiffusionTrigger={playDiffusionGrain}
            onWallBounce={onWallBounce}
            crystals={crystals}
            onCaptureCrystal={captureCrystal}
            onRemoveCrystal={removeCrystal}
            stretchFactor={stretchFactor}
          />
          {sounds.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p style={{ fontSize: fs(12), color: theme.colors.ink4, letterSpacing: "0.05em" }}>
                load a sound to see its granular field
              </p>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
