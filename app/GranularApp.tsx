"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

/**
 * "Layer Word" — granular sound layering and random node mapping.
 *
 * - Each loaded sound file is decoded to an AudioBuffer.
 * - The buffer is sliced into N time-based "layers".
 * - Each layer is assigned a cluster of nodes at random canvas positions.
 * - Triggering a node plays a grain (short window) from a random offset
 *   inside that layer, with a smoothed gain envelope to avoid clicks.
 * - Auto-play mode fires random nodes at a user-controlled density.
 */

type LayerNode = {
  id: string;
  soundId: string;
  layerIndex: number;
  /** Normalized position inside the layer's block (0..1 on each axis). */
  x: number;
  y: number;
  /** Random playback rate multiplier applied when this node is triggered. */
  rateJitter: number;
  /** Random pan in [-1, 1]. */
  pan: number;
};

type Sound = {
  id: string;
  name: string;
  buffer: AudioBuffer;
  /** HSL hue for visual identity of this sound's nodes. */
  hue: number;
  layers: number;
  grainMs: number;
  spread: number;
  pitchJitter: number;
  gain: number;
  nodes: LayerNode[];
};

const NODES_PER_LAYER = 6;
const MIN_GRAIN_MS = 20;
const MAX_GRAIN_MS = 2000;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Generate random node positions *inside* each layer's block.
 *
 * `spread` shrinks positions toward the block center:
 *   factor = clamp(spread * 2, 0.1, 1)
 *   local  = 0.5 + (U(0,1) - 0.5) * factor
 * so spread = 0.5 fills the block, spread = 0.05 tightly clusters at center.
 */
function buildNodes(
  soundId: string,
  layers: number,
  spread: number,
  perLayer = NODES_PER_LAYER,
): LayerNode[] {
  const nodes: LayerNode[] = [];
  const factor = Math.max(0.1, Math.min(1, spread * 2));
  const pad = 0.08;

  for (let layer = 0; layer < layers; layer++) {
    for (let i = 0; i < perLayer; i++) {
      const rx = Math.random();
      const ry = Math.random();
      const localX = 0.5 + (rx - 0.5) * factor;
      const localY = 0.5 + (ry - 0.5) * factor;
      nodes.push({
        id: uid(),
        soundId,
        layerIndex: layer,
        x: Math.max(pad, Math.min(1 - pad, localX)),
        y: Math.max(pad, Math.min(1 - pad, localY)),
        rateJitter: 0.9 + Math.random() * 0.3,
        pan: (Math.random() - 0.5) * 1.6,
      });
    }
  }
  return nodes;
}

export default function GranularApp() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoDensity, setAutoDensity] = useState(4); // events per second
  const [flash, setFlash] = useState<Record<string, number>>({});
  const flashTimersRef = useRef<Record<string, number>>({});

  const ensureContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = masterVolume;
      master.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterGainRef.current = master;
    } else if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, [masterVolume]);

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume;
    }
  }, [masterVolume]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  const triggerFlash = useCallback((nodeId: string) => {
    setFlash((f) => ({ ...f, [nodeId]: performance.now() }));
    window.clearTimeout(flashTimersRef.current[nodeId]);
    flashTimersRef.current[nodeId] = window.setTimeout(() => {
      setFlash((f) => {
        const next = { ...f };
        delete next[nodeId];
        return next;
      });
    }, 240);
  }, []);

  const playGrain = useCallback(
    (sound: Sound, node: LayerNode) => {
      const ctx = ensureContext();
      if (!ctx) return;
      const master = masterGainRef.current;
      if (!master) return;

      const duration = sound.buffer.duration;
      const layerSpan = duration / sound.layers;
      const layerStart = node.layerIndex * layerSpan;
      const layerEnd = layerStart + layerSpan;

      // Grain length is clamped only to the full buffer, not to one layer.
      // Long grains (1–2s) can therefore bleed past the chosen layer into
      // the remainder of the buffer — the layer still defines where the
      // grain *starts*.
      const grainSec = Math.min(sound.grainMs / 1000, duration);
      const hardMaxStart = Math.max(0, duration - grainSec);
      const startWindowEnd = Math.min(layerEnd, hardMaxStart);
      const offset =
        startWindowEnd > layerStart
          ? layerStart + Math.random() * (startWindowEnd - layerStart)
          : Math.min(layerStart, hardMaxStart);

      const source = ctx.createBufferSource();
      source.buffer = sound.buffer;
      const jitter =
        1 + (Math.random() * 2 - 1) * sound.pitchJitter * 0.5;
      source.playbackRate.value = Math.max(0.25, node.rateJitter * jitter);

      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = node.pan;

      const now = ctx.currentTime;
      // Envelope scales with grain length: tiny on short grains (click
      // avoidance only), longer fade on sustained grains so 1–2s grains
      // don't cut abruptly.
      const attack = Math.min(0.02, Math.max(0.003, grainSec * 0.1));
      const release = Math.min(0.2, Math.max(0.02, grainSec * 0.25));
      const peak = sound.gain;
      const sustainEnd = Math.max(attack, grainSec - release);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + attack);
      gain.gain.setValueAtTime(peak, now + sustainEnd);
      gain.gain.linearRampToValueAtTime(0, now + grainSec);

      source.connect(gain);
      gain.connect(panner);
      panner.connect(master);

      source.start(now, offset, grainSec + 0.02);
      source.stop(now + grainSec + 0.05);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        panner.disconnect();
      };

      triggerFlash(node.id);
    },
    [ensureContext, triggerFlash],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setLoadError(null);
      setIsLoading(true);
      const ctx = ensureContext();
      if (!ctx) {
        setIsLoading(false);
        return;
      }
      try {
        const newSounds: Sound[] = [];
        for (const file of list) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
            const id = uid();
            const layers = 6;
            const spread = 0.38;
            const sound: Sound = {
              id,
              name: file.name,
              buffer,
              hue: Math.floor(Math.random() * 360),
              layers,
              grainMs: 120,
              spread,
              pitchJitter: 0.2,
              gain: 0.8,
              nodes: buildNodes(id, layers, spread),
            };
            newSounds.push(sound);
          } catch (err) {
            console.error("Failed to decode", file.name, err);
            setLoadError(
              `Could not decode "${file.name}". Try WAV, MP3, OGG, or FLAC.`,
            );
          }
        }
        if (newSounds.length > 0) {
          setSounds((prev) => [...prev, ...newSounds]);
          setActiveSoundId((current) => current ?? newSounds[0].id);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [ensureContext],
  );

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const updateSound = useCallback(
    (id: string, patch: Partial<Sound>) => {
      setSounds((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const merged = { ...s, ...patch } as Sound;
          const layersChanged =
            patch.layers !== undefined && patch.layers !== s.layers;
          const spreadChanged =
            patch.spread !== undefined && patch.spread !== s.spread;
          if (layersChanged || spreadChanged) {
            merged.nodes = buildNodes(s.id, merged.layers, merged.spread);
          }
          return merged;
        }),
      );
    },
    [],
  );

  const remapSound = useCallback((id: string) => {
    setSounds((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, nodes: buildNodes(s.id, s.layers, s.spread) }
          : s,
      ),
    );
  }, []);

  const removeSound = useCallback(
    (id: string) => {
      setSounds((prev) => prev.filter((s) => s.id !== id));
      setActiveSoundId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  useEffect(() => {
    if (!autoPlay) return;
    if (sounds.length === 0) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const sound = sounds[Math.floor(Math.random() * sounds.length)];
      if (sound && sound.nodes.length > 0) {
        const node = sound.nodes[Math.floor(Math.random() * sound.nodes.length)];
        playGrain(sound, node);
      }
      const interval = 1000 / Math.max(0.5, autoDensity);
      const jitter = interval * (0.5 + Math.random());
      window.setTimeout(tick, jitter);
    };
    const handle = window.setTimeout(tick, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [autoPlay, autoDensity, sounds, playGrain]);

  const activeSound = useMemo(
    () => sounds.find((s) => s.id === activeSoundId) ?? null,
    [sounds, activeSoundId],
  );

  return (
    <div className="flex flex-col min-h-screen w-full bg-zinc-950 text-zinc-100 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Layer Word</h1>
          <p className="text-xs text-zinc-400">
            Granular sound layering with random node mapping
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Master
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="w-28 accent-fuchsia-500"
            />
          </label>
          <button
            type="button"
            onClick={() => setAutoPlay((v) => !v)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              autoPlay
                ? "bg-fuchsia-500 text-zinc-950 hover:bg-fuchsia-400"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
            disabled={sounds.length === 0}
          >
            {autoPlay ? "Stop auto" : "Auto play"}
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Density
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={autoDensity}
              onChange={(e) => setAutoDensity(parseFloat(e.target.value))}
              className="w-24 accent-fuchsia-500"
            />
            <span className="tabular-nums w-10 text-right">
              {autoDensity.toFixed(1)}/s
            </span>
          </label>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col">
          <Loader
            isLoading={isLoading}
            error={loadError}
            onFileInput={onFileInput}
            onDrop={onDrop}
          />
          <div className="flex-1 overflow-y-auto">
            {sounds.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500">
                No sounds loaded. Drop WAV / MP3 / OGG / FLAC files above to
                start.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {sounds.map((sound) => (
                  <li
                    key={sound.id}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      activeSoundId === sound.id
                        ? "bg-zinc-900"
                        : "hover:bg-zinc-900/50"
                    }`}
                    onClick={() => setActiveSoundId(sound.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{
                            background: `hsl(${sound.hue} 85% 60%)`,
                            boxShadow: `0 0 12px hsl(${sound.hue} 85% 60% / 0.7)`,
                          }}
                        />
                        <span className="truncate text-sm font-medium">
                          {sound.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSound(sound.id);
                        }}
                        className="text-xs text-zinc-500 hover:text-rose-400"
                        aria-label={`Remove ${sound.name}`}
                      >
                        ✕
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">
                      {sound.buffer.duration.toFixed(2)}s ·{" "}
                      {sound.layers} layers · {sound.nodes.length} nodes
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {activeSound ? (
            <SoundControls
              sound={activeSound}
              onChange={(patch) => updateSound(activeSound.id, patch)}
              onRemap={() => remapSound(activeSound.id)}
            />
          ) : null}
        </aside>

        <main className="flex-1 relative overflow-hidden bg-linear-to-br from-zinc-950 via-zinc-900 to-black">
          <NodeCanvas
            sounds={sounds}
            activeSoundId={activeSoundId}
            flash={flash}
            onTrigger={(sound, node) => {
              setActiveSoundId(sound.id);
              playGrain(sound, node);
            }}
          />
          {sounds.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-zinc-600 text-sm">
                Load a sound to see its granular node map.
              </p>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Loader({
  isLoading,
  error,
  onFileInput,
  onDrop,
}: {
  isLoading: boolean;
  error: string | null;
  onFileInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="p-4 border-b border-zinc-800">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          setDragOver(false);
          // Cast the event to DragEvent<HTMLDivElement> to match onDrop's type
          onDrop(e as unknown as DragEvent<HTMLDivElement>);
  
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-fuchsia-400 bg-fuchsia-500/10"
            : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/40"
        }`}
      >
        <span className="text-sm font-medium">
          {isLoading ? "Decoding..." : "Drop sounds or click"}
        </span>
        <span className="text-[11px] text-zinc-500">
          Multiple files supported
        </span>
        <input
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={onFileInput}
          onClick={(e) => {
            (e.target as HTMLInputElement).value = "";
          }}
        />
      </label>
      {error ? (
        <p className="mt-2 text-[11px] text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}

function SoundControls({
  sound,
  onChange,
  onRemap,
}: {
  sound: Sound;
  onChange: (patch: Partial<Sound>) => void;
  onRemap: () => void;
}) {
  return (
    <div className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-950/60">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500">
          Controls
        </h2>
        <button
          type="button"
          onClick={onRemap}
          className="text-[11px] rounded-full bg-zinc-800 px-3 py-1 hover:bg-zinc-700"
        >
          Remap nodes
        </button>
      </div>
      <Slider
        label="Layers"
        min={1}
        max={24}
        step={1}
        value={sound.layers}
        onChange={(v) => onChange({ layers: v })}
        format={(v) => `${v}`}
        hue={sound.hue}
      />
      <Slider
        label="Grain"
        min={MIN_GRAIN_MS}
        max={MAX_GRAIN_MS}
        step={5}
        value={sound.grainMs}
        onChange={(v) => onChange({ grainMs: v })}
        format={(v) => `${v.toFixed(0)}ms`}
        hue={sound.hue}
      />
      <Slider
        label="Spread"
        min={0.05}
        max={0.5}
        step={0.01}
        value={sound.spread}
        onChange={(v) => onChange({ spread: v })}
        format={(v) => v.toFixed(2)}
        hue={sound.hue}
      />
      <Slider
        label="Pitch jitter"
        min={0}
        max={1}
        step={0.01}
        value={sound.pitchJitter}
        onChange={(v) => onChange({ pitchJitter: v })}
        format={(v) => `${Math.round(v * 100)}%`}
        hue={sound.hue}
      />
      <Slider
        label="Gain"
        min={0}
        max={1.5}
        step={0.01}
        value={sound.gain}
        onChange={(v) => onChange({ gain: v })}
        format={(v) => v.toFixed(2)}
        hue={sound.hue}
      />
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  hue,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  hue: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-300">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ accentColor: `hsl(${hue} 85% 60%)` }}
      />
    </label>
  );
}

/**
 * Stacked-blocks visualization.
 *
 * Each loaded sound renders as a vertical column; each column is subdivided
 * into equal-height "layer" blocks (layer 0 on top → layer N-1 on bottom).
 * Nodes live inside their layer's block at randomized positions, so the time
 * structure (layer order) is visually obvious while spatial placement within
 * a layer remains random.
 */
function NodeCanvas({
  sounds,
  activeSoundId,
  flash,
  onTrigger,
}: {
  sounds: Sound[];
  activeSoundId: string | null;
  flash: Record<string, number>;
  onTrigger: (sound: Sound, node: LayerNode) => void;
}) {
  if (sounds.length === 0) return null;
  return (
    <div className="absolute inset-0 flex gap-3 p-4 overflow-auto">
      {sounds.map((sound) => (
        <SoundStack
          key={sound.id}
          sound={sound}
          isActive={activeSoundId === sound.id}
          flash={flash}
          onTrigger={onTrigger}
        />
      ))}
    </div>
  );
}

function SoundStack({
  sound,
  isActive,
  flash,
  onTrigger,
}: {
  sound: Sound;
  isActive: boolean;
  flash: Record<string, number>;
  onTrigger: (sound: Sound, node: LayerNode) => void;
}) {
  const nodesByLayer = useMemo(() => {
    const buckets: LayerNode[][] = Array.from(
      { length: sound.layers },
      () => [],
    );
    for (const n of sound.nodes) {
      if (n.layerIndex < buckets.length) buckets[n.layerIndex].push(n);
    }
    return buckets;
  }, [sound.nodes, sound.layers]);

  return (
    <div className="flex-1 min-w-[160px] flex flex-col">
      <div
        className="mb-2 text-[11px] text-center truncate font-medium"
        style={{
          color: isActive ? `hsl(${sound.hue} 85% 70%)` : "#71717a",
        }}
        title={sound.name}
      >
        {sound.name}
      </div>
      <div className="flex-1 flex flex-col gap-[3px]">
        {nodesByLayer.map((layerNodes, k) => {
          const rel = sound.layers > 1 ? k / (sound.layers - 1) : 0;
          const lightness = 45 + rel * 22;
          const color = `hsl(${sound.hue} 85% ${60 + rel * 15}%)`;
          return (
            <div
              key={k}
              className="flex-1 relative rounded-md overflow-hidden"
              style={{
                backgroundColor: `hsl(${sound.hue} 60% ${lightness}% / ${
                  isActive ? 0.16 : 0.07
                })`,
                border: `1px solid hsl(${sound.hue} 70% ${lightness}% / ${
                  isActive ? 0.55 : 0.2
                })`,
              }}
            >
              <span className="pointer-events-none select-none absolute left-2 top-1 text-[9px] font-mono text-zinc-500 tabular-nums">
                L{k}
              </span>
              {layerNodes.map((node) => {
                const flashed = Boolean(flash[node.id]);
                const size = flashed ? 24 : 12;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onTrigger(sound, node);
                    }}
                    onPointerEnter={(e) => {
                      if (e.buttons === 1) onTrigger(sound, node);
                    }}
                    aria-label={`Sound ${sound.name}, layer ${k}`}
                    className="absolute rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ease-out cursor-pointer focus:outline-none"
                    style={{
                      left: `${node.x * 100}%`,
                      top: `${node.y * 100}%`,
                      width: size,
                      height: size,
                      backgroundColor: color,
                      boxShadow: `0 0 ${flashed ? 20 : 8}px ${color}`,
                      opacity: flashed ? 1 : isActive ? 0.95 : 0.6,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
