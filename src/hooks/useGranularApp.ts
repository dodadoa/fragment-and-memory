import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import type { LayerNode, LoopEvent, PalimpsestLayer, Sound, SpectralCrystal, Trace } from "@/granular/types";
import {
  MAX_CRYSTALS,
  MAX_PALIMPSEST_LAYERS,
  PALIMPSEST_DECAY,
  PALIMPSEST_DRIFT_STEP,
  PALIMPSEST_JITTER_STEP,
  PALIMPSEST_MIN_DECAY,
  SOUND_PALETTE,
  TRACE_DURATION_MS,
} from "@/granular/types";
import {
  analyzeLayerPitches,
  buildNodes,
  normalizeBuffer,
  spawnNode,
  uid,
} from "@/granular/domain";

export function useGranularApp() {

  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Bus A: manual / auto-play grains ────────────────────────────────
  // master → dryGain ─┐
  //                   ├→ grainBusOut → destination
  // master → awReverb → reverbGain ─┘
  const masterGainRef   = useRef<GainNode | null>(null);
  const reverbGainRef   = useRef<GainNode | null>(null);
  const dryGainRef      = useRef<GainNode | null>(null);
  const awReverbRef     = useRef<AudioWorkletNode | null>(null);

  // ── Bus B: diffusion agents — feedback delay loop + reverb ──────────
  // Routing: grains → diffusionMaster
  //   → diffusionDry ─┐
  //                    ├→ diffusionBusOut → destination
  //   → diffusionAwReverb → diffusionReverbGain ─┘
  //   → diffusionDelay → diffusionFeedback → diffusionMaster  (cycle!)
  const diffusionMasterRef    = useRef<GainNode | null>(null);
  const diffusionDryRef       = useRef<GainNode | null>(null);
  const diffusionReverbGainRef = useRef<GainNode | null>(null);
  const diffusionDelayRef     = useRef<DelayNode | null>(null);
  const diffusionFeedbackRef  = useRef<GainNode | null>(null);
  const diffusionAwReverbRef  = useRef<AudioWorkletNode | null>(null);

  // ── Bus C: spectral freeze (independent from agent bus) ───────────────
  const spectralMasterRef      = useRef<GainNode | null>(null);
  const spectralDryRef         = useRef<GainNode | null>(null);
  const spectralReverbGainRef  = useRef<GainNode | null>(null);
  const spectralAwReverbRef    = useRef<AudioWorkletNode | null>(null);

  // ── Bus D: palimpsest layer playback (independent reverb) ─────
  const layerMasterRef         = useRef<GainNode | null>(null);
  const layerDryRef            = useRef<GainNode | null>(null);
  const layerReverbGainRef     = useRef<GainNode | null>(null);
  const layerAwReverbRef       = useRef<AudioWorkletNode | null>(null);

  /** Post–dry/wet sum: balances each bus against the others at the destination. */
  const grainBusOutRef         = useRef<GainNode | null>(null);
  const diffusionBusOutRef     = useRef<GainNode | null>(null);
  const spectralBusOutRef      = useRef<GainNode | null>(null);
  const layerBusOutRef         = useRef<GainNode | null>(null);

  const diffusionFeedbackBaseRef = useRef(0.32);
  const diffusionDelayMsRef      = useRef(120);
  const lastWallBounceRef        = useRef(0);

  // ── Spectral crystals ─────────────────────────────────────────────────
  const crystalTimersRef         = useRef<Map<string, number>>(new Map());
  const playCrystalGrainFnRef    = useRef<((c: SpectralCrystal) => void) | null>(null);
  const crystalLevelRef          = useRef(1.2);

  // ── Palimpsest layering ──────────────────────────────────────────────
  const isPalimpsestRecordingRef   = useRef(false);
  const palimpsestStartRef         = useRef<number | null>(null);
  const palimpsestEventsRef        = useRef<LoopEvent[]>([]);
  const palimpsestLayersRef        = useRef<PalimpsestLayer[]>([]);
  const palimpsestNodeThrottleRef  = useRef<Map<string, number>>(new Map());
  const palimpsestLoopRef          = useRef<Map<string, number>>(new Map()); // layerId → next-loop setTimeout handle
  const playPalimpsestGrainRef     = useRef<((s: Sound, n: LayerNode, decay: number, drift: number) => void) | null>(null);
  const schedulePalimpsestRef      = useRef<((layer: PalimpsestLayer) => void) | null>(null);

  const [crystals, setCrystals]         = useState<SpectralCrystal[]>([]);
  const [crystalLevel, setCrystalLevel]   = useState(1.2);
  const crystalsRef = useRef<SpectralCrystal[]>([]);
  const soundsRef2  = useRef<Sound[]>([]); // alias kept in sync for crystal playback

  const [palimpsestLayers, setPalimpsestLayers] = useState<PalimpsestLayer[]>([]);
  const [isPalimpsestRecording, setIsPalimpsestRecording] = useState(false);

  const [sounds, setSounds] = useState<Sound[]>([]);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoDensity, setAutoDensity] = useState(4);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const flashTimersRef = useRef<Record<string, number>>({});

  // ── A: Mortal nodes ──────────────────────────────────────────────────
  const consumeNodeLife = useCallback((soundId: string, nodeId: string) => {
    setSounds((prev) =>
      prev.map((s) => {
        if (s.id !== soundId) return s;
        const target = s.nodes.find((n) => n.id === nodeId);
        if (!target) return s;
        const newLife = target.life - 1;
        if (newLife > 0) {
          return { ...s, nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, life: newLife } : n) };
        }
        return {
          ...s,
          nodes: [
            ...s.nodes.filter((n) => n.id !== nodeId),
            spawnNode(s.id, target.layerIndex, s.spread),
          ],
        };
      }),
    );
  }, []);

  // ── B: Trace marks ───────────────────────────────────────────────────
  const [traces, setTraces] = useState<Trace[]>([]);

  const addTrace = useCallback((node: LayerNode, hue: number) => {
    const t: Trace = {
      id: uid(), x: node.x, y: node.y,
      layerIndex: node.layerIndex, hue,
      createdAt: performance.now(),
    };
    setTraces((prev) => [...prev, t]);
    window.setTimeout(
      () => setTraces((prev) => prev.filter((tr) => tr.id !== t.id)),
      TRACE_DURATION_MS + 200,
    );
  }, []);

  useEffect(() => { crystalsRef.current = crystals; }, [crystals]);
  useEffect(() => { crystalLevelRef.current = crystalLevel; }, [crystalLevel]);
  useEffect(() => { palimpsestLayersRef.current = palimpsestLayers; }, [palimpsestLayers]);
  useEffect(() => { isPalimpsestRecordingRef.current = isPalimpsestRecording; }, [isPalimpsestRecording]);

  const soundsRef = useRef(sounds);
  const autoDensityRef = useRef(autoDensity);
  const addTraceRef = useRef(addTrace);
  const consumeNodeLifeRef = useRef(consumeNodeLife);
  const autoPlayTimerRef = useRef<number | null>(null);

  useEffect(() => { soundsRef.current = sounds; soundsRef2.current = sounds; }, [sounds]);
  useEffect(() => { autoDensityRef.current = autoDensity; }, [autoDensity]);
  useEffect(() => { addTraceRef.current = addTrace; }, [addTrace]);
  useEffect(() => { consumeNodeLifeRef.current = consumeNodeLife; }, [consumeNodeLife]);

  // ── C: Degrading loop recorder ────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [loopEvents, setLoopEvents] = useState<LoopEvent[]>([]);
  const [isLooping, setIsLooping] = useState(false);
  const [loopIteration, setLoopIteration] = useState(0);
  const recordStartRef = useRef<number | null>(null);
  const loopSoundsRef = useRef<Sound[]>([]);
  const playGrainRef = useRef<((s: Sound, n: LayerNode) => void) | null>(null);

  const recordEvent = useCallback((soundId: string, nodeId: string) => {
    if (isRecording && recordStartRef.current !== null) {
      setLoopEvents((prev) => [
        ...prev,
        { soundId, nodeId, relativeTime: performance.now() - recordStartRef.current! },
      ]);
    }
    if (isPalimpsestRecordingRef.current && palimpsestStartRef.current !== null) {
      palimpsestEventsRef.current.push({
        soundId, nodeId,
        relativeTime: performance.now() - palimpsestStartRef.current,
      });
    }
  }, [isRecording]);

  const startRecording = useCallback(() => {
    setLoopEvents([]);
    setIsLooping(false);
    setIsRecording(true);
    recordStartRef.current = performance.now();
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    loopSoundsRef.current = sounds;
    setLoopIteration(0);
    setIsLooping(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sounds]);

  const clearLoop = useCallback(() => {
    setIsLooping(false);
    setIsRecording(false);
    setLoopEvents([]);
    setLoopIteration(0);
  }, []);

  // ── Reverb state — Bus A (grains) ─────────────────────────────────────
  const [reverbMix,   setReverbMix]   = useState(0);
  const [reverbSize,  setReverbSize]  = useState(0.5);
  const [reverbDrive, setReverbDrive] = useState(0.3);

  // ── Reverb + feedback state — Bus B (diffusion agents) ───────────────
  const [diffusionReverbMix,   setDiffusionReverbMix]   = useState(0.65);
  const [diffusionReverbSize,  setDiffusionReverbSize]  = useState(0.72);
  const [diffusionReverbDrive, setDiffusionReverbDrive] = useState(0.45);
  const [diffusionFeedback,    setDiffusionFeedback]    = useState(0.32);
  const [diffusionDelayMs,     setDiffusionDelayMs]     = useState(120);

  // ── Reverb state — Bus C (spectral freeze) ────────────────────────────
  const [spectralReverbMix,   setSpectralReverbMix]   = useState(0.62);
  const [spectralReverbSize,  setSpectralReverbSize]  = useState(0.7);
  const [spectralReverbDrive, setSpectralReverbDrive] = useState(0.42);

  // ── Reverb state — Bus D (stack-memory / palimpsest playback) ─────────
  const [layerReverbMix,   setLayerReverbMix]   = useState(0.48);
  const [layerReverbSize,  setLayerReverbSize]  = useState(0.58);
  const [layerReverbDrive, setLayerReverbDrive] = useState(0.35);

  const [grainOutputLevel, setGrainOutputLevel] = useState(1);
  const [diffusionOutputLevel, setDiffusionOutputLevel] = useState(1);
  const [spectralOutputLevel, setSpectralOutputLevel] = useState(1);
  const [layerOutputLevel, setLayerOutputLevel] = useState(1);

  useEffect(() => { diffusionFeedbackBaseRef.current = diffusionFeedback; }, [diffusionFeedback]);
  useEffect(() => { diffusionDelayMsRef.current = diffusionDelayMs; }, [diffusionDelayMs]);

  const ensureContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();

      // ── Bus A: grain master ──────────────────────────────────────────
      const master = ctx.createGain();
      master.gain.value = masterVolume;

      const dryGain = ctx.createGain();
      dryGain.gain.value = 1;
      master.connect(dryGain);

      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0;

      const grainBusOut = ctx.createGain();
      grainBusOut.gain.value = 1;
      dryGain.connect(grainBusOut);
      reverbGain.connect(grainBusOut);
      grainBusOut.connect(ctx.destination);

      // ── Bus B: diffusion master + feedback loop ──────────────────────
      const diffMaster = ctx.createGain();
      diffMaster.gain.value = masterVolume;

      const diffDry = ctx.createGain();
      // constant-power mix: cos(0.65 * PI/2) ≈ 0.59
      const initAngle = (0.65 * Math.PI) / 2;
      diffDry.gain.value = Math.cos(initAngle);
      diffMaster.connect(diffDry);

      const diffReverbGain = ctx.createGain();
      diffReverbGain.gain.value = Math.sin(initAngle);

      const diffusionBusOut = ctx.createGain();
      diffusionBusOut.gain.value = 1;
      diffDry.connect(diffusionBusOut);
      diffReverbGain.connect(diffusionBusOut);
      diffusionBusOut.connect(ctx.destination);

      // ── Bus C: spectral freeze master ─────────────────────────────────
      const spectralMaster = ctx.createGain();
      spectralMaster.gain.value = masterVolume;
      const spectralAngle = (0.62 * Math.PI) / 2;
      const spectralDry = ctx.createGain();
      spectralDry.gain.value = Math.cos(spectralAngle);
      spectralMaster.connect(spectralDry);
      const spectralReverbGain = ctx.createGain();
      spectralReverbGain.gain.value = Math.sin(spectralAngle);

      const spectralBusOut = ctx.createGain();
      spectralBusOut.gain.value = 1;
      spectralDry.connect(spectralBusOut);
      spectralReverbGain.connect(spectralBusOut);
      spectralBusOut.connect(ctx.destination);

      // ── Bus D: layer record playback master ───────────────────────────
      const layerMaster = ctx.createGain();
      layerMaster.gain.value = masterVolume;
      const layerAngle = (0.48 * Math.PI) / 2;
      const layerDry = ctx.createGain();
      layerDry.gain.value = Math.cos(layerAngle);
      layerMaster.connect(layerDry);
      const layerReverbGain = ctx.createGain();
      layerReverbGain.gain.value = Math.sin(layerAngle);

      const layerBusOut = ctx.createGain();
      layerBusOut.gain.value = 1;
      layerDry.connect(layerBusOut);
      layerReverbGain.connect(layerBusOut);
      layerBusOut.connect(ctx.destination);

      // Feedback delay cycle: diffMaster → delay → feedbackGain → diffMaster
      // Web Audio allows cycles that contain at least one DelayNode.
      const diffDelay = ctx.createDelay(2.0);
      diffDelay.delayTime.value = 0.12;
      const diffFeedback = ctx.createGain();
      diffFeedback.gain.value = 0.32;
      diffMaster.connect(diffDelay);
      diffDelay.connect(diffFeedback);
      diffFeedback.connect(diffMaster);

      audioCtxRef.current           = ctx;
      masterGainRef.current         = master;
      reverbGainRef.current         = reverbGain;
      dryGainRef.current            = dryGain;
      diffusionMasterRef.current    = diffMaster;
      diffusionDryRef.current       = diffDry;
      diffusionReverbGainRef.current = diffReverbGain;
      diffusionDelayRef.current     = diffDelay;
      diffusionFeedbackRef.current  = diffFeedback;
      spectralMasterRef.current     = spectralMaster;
      spectralDryRef.current        = spectralDry;
      spectralReverbGainRef.current = spectralReverbGain;
      layerMasterRef.current        = layerMaster;
      layerDryRef.current           = layerDry;
      layerReverbGainRef.current    = layerReverbGain;
      grainBusOutRef.current        = grainBusOut;
      diffusionBusOutRef.current    = diffusionBusOut;
      spectralBusOutRef.current     = spectralBusOut;
      layerBusOutRef.current        = layerBusOut;

      // Load AudioWorklet — creates two independent reverb instances
      void ctx.audioWorklet
        .addModule("./airwindows-reverb.worklet.js")
        .then(() => {
          // Bus A reverb
          const awGrain = new AudioWorkletNode(ctx, "airwindows-reverb", {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          });
          awGrain.parameters.get("big")?.setValueAtTime(reverbSize,  ctx.currentTime);
          awGrain.parameters.get("wet")?.setValueAtTime(reverbDrive, ctx.currentTime);
          master.connect(awGrain);
          awGrain.connect(reverbGain);
          awReverbRef.current = awGrain;

          // Bus B reverb
          const awDiff = new AudioWorkletNode(ctx, "airwindows-reverb", {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          });
          awDiff.parameters.get("big")?.setValueAtTime(0.72, ctx.currentTime);
          awDiff.parameters.get("wet")?.setValueAtTime(0.45, ctx.currentTime);
          diffMaster.connect(awDiff);
          awDiff.connect(diffReverbGain);
          diffusionAwReverbRef.current = awDiff;

          // Bus C reverb (spectral)
          const awSpectral = new AudioWorkletNode(ctx, "airwindows-reverb", {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          });
          awSpectral.parameters.get("big")?.setValueAtTime(0.7, ctx.currentTime);
          awSpectral.parameters.get("wet")?.setValueAtTime(0.42, ctx.currentTime);
          spectralMaster.connect(awSpectral);
          awSpectral.connect(spectralReverbGain);
          spectralAwReverbRef.current = awSpectral;

          // Bus D reverb (layer record playback)
          const awLayer = new AudioWorkletNode(ctx, "airwindows-reverb", {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          });
          awLayer.parameters.get("big")?.setValueAtTime(0.58, ctx.currentTime);
          awLayer.parameters.get("wet")?.setValueAtTime(0.35, ctx.currentTime);
          layerMaster.connect(awLayer);
          awLayer.connect(layerReverbGain);
          layerAwReverbRef.current = awLayer;
        })
        .catch((e) => console.warn("AudioWorklet load failed:", e));

    } else if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterVolume]);

  // ── Parameter sync effects ────────────────────────────────────────────
  useEffect(() => {
    if (masterGainRef.current)      masterGainRef.current.gain.value      = masterVolume;
    if (diffusionMasterRef.current) diffusionMasterRef.current.gain.value = masterVolume;
    if (spectralMasterRef.current)  spectralMasterRef.current.gain.value  = masterVolume;
    if (layerMasterRef.current)     layerMasterRef.current.gain.value     = masterVolume;
  }, [masterVolume]);

  useEffect(() => {
    const a = (reverbMix * Math.PI) / 2;
    if (dryGainRef.current)    dryGainRef.current.gain.value    = Math.cos(a);
    if (reverbGainRef.current) reverbGainRef.current.gain.value = Math.sin(a);
  }, [reverbMix]);

  useEffect(() => {
    const a = (diffusionReverbMix * Math.PI) / 2;
    if (diffusionDryRef.current)        diffusionDryRef.current.gain.value        = Math.cos(a);
    if (diffusionReverbGainRef.current) diffusionReverbGainRef.current.gain.value = Math.sin(a);
  }, [diffusionReverbMix]);

  useEffect(() => {
    const a = (spectralReverbMix * Math.PI) / 2;
    if (spectralDryRef.current)        spectralDryRef.current.gain.value        = Math.cos(a);
    if (spectralReverbGainRef.current) spectralReverbGainRef.current.gain.value = Math.sin(a);
  }, [spectralReverbMix]);

  useEffect(() => {
    const a = (layerReverbMix * Math.PI) / 2;
    if (layerDryRef.current)        layerDryRef.current.gain.value        = Math.cos(a);
    if (layerReverbGainRef.current) layerReverbGainRef.current.gain.value = Math.sin(a);
  }, [layerReverbMix]);

  useEffect(() => {
    if (grainBusOutRef.current) grainBusOutRef.current.gain.value = grainOutputLevel;
  }, [grainOutputLevel]);

  useEffect(() => {
    if (diffusionBusOutRef.current) diffusionBusOutRef.current.gain.value = diffusionOutputLevel;
  }, [diffusionOutputLevel]);

  useEffect(() => {
    if (spectralBusOutRef.current) spectralBusOutRef.current.gain.value = spectralOutputLevel;
  }, [spectralOutputLevel]);

  useEffect(() => {
    if (layerBusOutRef.current) layerBusOutRef.current.gain.value = layerOutputLevel;
  }, [layerOutputLevel]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    awReverbRef.current?.parameters.get("big")?.setValueAtTime(reverbSize, ctx.currentTime);
  }, [reverbSize]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    awReverbRef.current?.parameters.get("wet")?.setValueAtTime(reverbDrive, ctx.currentTime);
  }, [reverbDrive]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    diffusionAwReverbRef.current?.parameters.get("big")?.setValueAtTime(diffusionReverbSize, ctx.currentTime);
  }, [diffusionReverbSize]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    diffusionAwReverbRef.current?.parameters.get("wet")?.setValueAtTime(diffusionReverbDrive, ctx.currentTime);
  }, [diffusionReverbDrive]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    spectralAwReverbRef.current?.parameters.get("big")?.setValueAtTime(spectralReverbSize, ctx.currentTime);
  }, [spectralReverbSize]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    spectralAwReverbRef.current?.parameters.get("wet")?.setValueAtTime(spectralReverbDrive, ctx.currentTime);
  }, [spectralReverbDrive]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    layerAwReverbRef.current?.parameters.get("big")?.setValueAtTime(layerReverbSize, ctx.currentTime);
  }, [layerReverbSize]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    layerAwReverbRef.current?.parameters.get("wet")?.setValueAtTime(layerReverbDrive, ctx.currentTime);
  }, [layerReverbDrive]);

  useEffect(() => {
    const ctx = audioCtxRef.current; if (!ctx) return;
    if (diffusionFeedbackRef.current) {
      diffusionFeedbackRef.current.gain.setValueAtTime(diffusionFeedback, ctx.currentTime);
    }
    diffusionFeedbackBaseRef.current = diffusionFeedback;
  }, [diffusionFeedback]);

  useEffect(() => {
    if (diffusionDelayRef.current) {
      diffusionDelayRef.current.delayTime.value = diffusionDelayMs / 1000;
    }
    diffusionDelayMsRef.current = diffusionDelayMs;
  }, [diffusionDelayMs]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ── Flash ─────────────────────────────────────────────────────────────
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

  // ── Bus A: manual/auto-play grain ────────────────────────────────────
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

      const grainSec = Math.min(sound.grainMs / 1000, duration);
      const hardMaxStart = Math.max(0, duration - grainSec);
      const startWindowEnd = Math.min(layerEnd, hardMaxStart);
      const offset =
        startWindowEnd > layerStart
          ? layerStart + Math.random() * (startWindowEnd - layerStart)
          : Math.min(layerStart, hardMaxStart);

      const source = ctx.createBufferSource();
      source.buffer = sound.buffer;
      const jitter = 1 + (Math.random() * 2 - 1) * sound.pitchJitter * 0.5;
      source.playbackRate.value = Math.max(0.1, node.rateJitter * jitter);

      const gain   = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = node.pan;

      const now = ctx.currentTime;
      const attack  = Math.min(0.02, Math.max(0.003, grainSec * 0.1));
      const release = Math.min(0.2,  Math.max(0.02,  grainSec * 0.25));
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
      source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); };

      triggerFlash(node.id);
    },
    [ensureContext, triggerFlash],
  );

  useEffect(() => { playGrainRef.current = playGrain; }, [playGrain]);

  // ── Bus B: diffusion grain ────────────────────────────────────────────
  // Plays a grain through the diffusion bus (with feedback loop + reverb).
  // strength 0–1: proximity weight — stronger contact = longer, louder grain.
  const playDiffusionGrain = useCallback(
    (sound: Sound, node: LayerNode, strength: number) => {
      const ctx = ensureContext();
      if (!ctx) return;
      const diffBus = diffusionMasterRef.current;
      if (!diffBus) return;

      const duration = sound.buffer.duration;
      const layerSpan  = duration / sound.layers;
      const layerStart = node.layerIndex * layerSpan;
      const layerEnd   = layerStart + layerSpan;

      const baseGrainSec = Math.min(sound.grainMs / 1000, duration);
      const grainSec = Math.min(baseGrainSec * (0.6 + strength * 1.2), duration);

      const hardMaxStart = Math.max(0, duration - grainSec);
      const windowEnd = Math.min(layerEnd, hardMaxStart);
      const offset =
        windowEnd > layerStart
          ? layerStart + Math.random() * (windowEnd - layerStart)
          : Math.min(layerStart, hardMaxStart);

      const source = ctx.createBufferSource();
      source.buffer = sound.buffer;

      const basePitch    = 0.97 + strength * 0.06;
      const pitchJitter  = sound.pitchJitter;
      const pitchRand    = 1 + (Math.random() * 2 - 1) * pitchJitter * 0.5;
      source.playbackRate.value = Math.max(0.08, node.rateJitter * basePitch * pitchRand);

      const gain   = ctx.createGain();
      const panner = ctx.createStereoPanner();
      panner.pan.value = node.pan;

      const now = ctx.currentTime;
      const attack  = Math.min(0.06, Math.max(0.005, grainSec * 0.15));
      const release = Math.min(0.45, Math.max(0.03,  grainSec * 0.3));
      const peak    = sound.gain * Math.max(0.15, strength) * 0.75;
      const sustainEnd = Math.max(attack, grainSec - release);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + attack);
      gain.gain.setValueAtTime(peak, now + sustainEnd);
      gain.gain.linearRampToValueAtTime(0, now + grainSec);

      source.connect(gain);
      gain.connect(panner);
      panner.connect(diffBus);

      source.start(now, offset, grainSec + 0.02);
      source.stop(now + grainSec + 0.05);
      source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); };

      triggerFlash(node.id);

      // Capture into palimpsest if recording — throttle to 200 ms per node
      if (isPalimpsestRecordingRef.current && palimpsestStartRef.current !== null) {
        const last = palimpsestNodeThrottleRef.current.get(node.id) ?? 0;
        const ts   = performance.now();
        if (ts - last > 200) {
          palimpsestEventsRef.current.push({
            soundId: sound.id, nodeId: node.id,
            relativeTime: ts - palimpsestStartRef.current,
          });
          palimpsestNodeThrottleRef.current.set(node.id, ts);
        }
      }
    },
    [ensureContext, triggerFlash],
  );

  // ── Wall bounce — spikes the feedback gain briefly ────────────────────
  // Called by NodeCanvas whenever a diffusion agent crosses a layer boundary.
  // The spike pushes the feedback delay loop into a brief resonance,
  // creating the "sound bouncing off the wall" sensation.
  const onWallBounce = useCallback(() => {
    const now = performance.now();
    if (now - lastWallBounceRef.current < 260) return; // debounce per 260 ms
    lastWallBounceRef.current = now;

    const ctx = audioCtxRef.current;
    const fb  = diffusionFeedbackRef.current;
    if (!ctx || !fb) return;

    const t    = ctx.currentTime;
    const base = diffusionFeedbackBaseRef.current;
    const spike = Math.min(0.82, base + 0.42);

    fb.gain.cancelScheduledValues(t);
    fb.gain.setValueAtTime(spike, t);
    fb.gain.exponentialRampToValueAtTime(Math.max(0.001, base), t + 0.45);
  }, []);

  // ── Spectral freeze: crystal grain engine ────────────────────────────
  // Each crystal retriggers very short, densely overlapping grains from a
  // single frozen buffer position — creating a sustained drone that feeds
  // into the same diffusion bus (reverb + feedback loop).
  const playCrystalGrain = useCallback((crystal: SpectralCrystal) => {
    const ctx = ensureContext();
    if (!ctx) return;
    const bus = spectralMasterRef.current;
    if (!bus) return;
    const sound = soundsRef2.current.find((s) => s.id === crystal.soundId);
    if (!sound) return;

    const grainSec = 0.032 + Math.random() * 0.048; // 32–80 ms
    const microJitter = (Math.random() - 0.5) * 0.007;
    const offset = Math.max(0, Math.min(
      sound.buffer.duration - grainSec,
      crystal.bufferOffset + microJitter,
    ));

    const source = ctx.createBufferSource();
    source.buffer = sound.buffer;
    // Tiny pitch microvariation for organic shimmer
    source.playbackRate.value = 0.994 + Math.random() * 0.012;

    const gain   = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = crystal.pan;

    const now     = ctx.currentTime;
    const attack  = 0.012;
    const release = 0.018;
    const peak    = sound.gain * crystalLevelRef.current;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.setValueAtTime(peak, now + grainSec - release);
    gain.gain.linearRampToValueAtTime(0, now + grainSec);

    source.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    source.start(now, offset, grainSec + 0.005);
    source.stop(now + grainSec + 0.01);
    source.onended = () => { source.disconnect(); gain.disconnect(); panner.disconnect(); };
  }, [ensureContext]);

  // Keep a ref always pointing at latest playCrystalGrain for the timers
  useEffect(() => { playCrystalGrainFnRef.current = playCrystalGrain; }, [playCrystalGrain]);

  const captureCrystal = useCallback((
    sound: Sound,
    node: LayerNode,
    cx: number,
    cy: number,
  ) => {
    // Compute exact buffer offset: middle of this node's y position within its layer
    const layerSpan    = sound.buffer.duration / sound.layers;
    const layerStart   = node.layerIndex * layerSpan;
    const bufferOffset = Math.max(0, Math.min(
      sound.buffer.duration * 0.97,
      layerStart + node.y * layerSpan * 0.9,
    ));

    const crystal: SpectralCrystal = {
      id: uid(),
      soundId: sound.id,
      hue: sound.hue,
      bufferOffset,
      pan: node.pan,
      cx,
      cy,
    };

    // Start dense grain loop — the timer survives re-renders via ref
    const cid = crystal.id;
    const tick = () => {
      if (!crystalTimersRef.current.has(cid)) return;
      playCrystalGrainFnRef.current?.(crystal);
      const delay = 20 + Math.random() * 30; // 20–50 ms between grains
      crystalTimersRef.current.set(cid, window.setTimeout(tick, delay));
    };
    crystalTimersRef.current.set(cid, window.setTimeout(tick, 0));

    setCrystals((prev) => {
      const next = [...prev, crystal];
      if (next.length > MAX_CRYSTALS) {
        // Evict oldest — stop its timer first
        const oldest = next[0];
        const h = crystalTimersRef.current.get(oldest.id);
        if (h !== undefined) { window.clearTimeout(h); crystalTimersRef.current.delete(oldest.id); }
        return next.slice(1);
      }
      return next;
    });

    // Momentary wall-bounce spike to announce the new freeze
    onWallBounce();
  }, [onWallBounce]);

  const removeCrystal = useCallback((id: string) => {
    const h = crystalTimersRef.current.get(id);
    if (h !== undefined) { window.clearTimeout(h); crystalTimersRef.current.delete(id); }
    setCrystals((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Cleanup all crystal timers on unmount
  useEffect(() => () => {
    crystalTimersRef.current.forEach((h) => window.clearTimeout(h));
    crystalTimersRef.current.clear();
  }, []);

  // ── Palimpsest grain (Bus A — same space as manual grains, ghost-quiet) ─
  const playPalimpsestGrain = useCallback((
    sound: Sound,
    node: LayerNode,
    decayLevel: number,
    pitchDrift: number,
  ) => {
    const ctx = ensureContext();
    if (!ctx) return;
    const layerBus = layerMasterRef.current;
    if (!layerBus) return;

    const duration   = sound.buffer.duration;
    const layerSpan  = duration / sound.layers;
    const layerStart = node.layerIndex * layerSpan;
    const layerEnd   = layerStart + layerSpan;
    const baseGrainSec = Math.min(sound.grainMs / 1000, duration);
    const grainSec     = baseGrainSec;
    const hardMax    = Math.max(0, duration - grainSec);
    const winEnd     = Math.min(layerEnd, hardMax);
    const offset     = winEnd > layerStart
      ? layerStart + Math.random() * (winEnd - layerStart)
      : Math.min(layerStart, hardMax);

    const source = ctx.createBufferSource();
    source.buffer = sound.buffer;
    // Older layers drift in pitch — the accumulated jitter makes them wander
    const totalJitter = sound.pitchJitter + pitchDrift;
    const jitter = 1 + (Math.random() * 2 - 1) * totalJitter * 0.5;
    source.playbackRate.value = Math.max(0.05, node.rateJitter * jitter);

    const d = Math.max(0.04, decayLevel);
    // Deeper in the stack → quieter + darker (low-pass), like sinking into reverb wash
    const dullMix = 0.18 + 0.82 * Math.pow(d, 0.85);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 380 + 11800 * dullMix;
    tone.Q.value = 0.62;

    const gain   = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = node.pan;

    const now      = ctx.currentTime;
    const attack   = Math.min(0.025, Math.max(0.004, grainSec * 0.12));
    const release  = Math.min(0.22,  Math.max(0.025, grainSec * 0.28));
    const levelMul = (0.32 + 0.68 * Math.pow(d, 1.05));
    const peak     = sound.gain * decayLevel * 0.8 * levelMul;
    const sustEnd  = Math.max(attack, grainSec - release);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.setValueAtTime(peak, now + sustEnd);
    gain.gain.linearRampToValueAtTime(0, now + grainSec);

    source.connect(tone);
    tone.connect(gain);
    gain.connect(panner);
    panner.connect(layerBus);
    source.start(now, offset, grainSec + 0.02);
    source.stop(now + grainSec + 0.05);
    source.onended = () => {
      source.disconnect();
      tone.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
  }, [ensureContext]);

  useEffect(() => { playPalimpsestGrainRef.current = playPalimpsestGrain; }, [playPalimpsestGrain]);

  // ── Palimpsest loop scheduler ─────────────────────────────────────────
  // Schedules one full pass through a layer's events, then reschedules
  // itself after duration+buffer. Uses the latest decayLevel / pitchDrift
  // from palimpsestLayersRef so updates propagate without restart.
  const schedulePalimpsestLayer = useCallback((layer: PalimpsestLayer) => {
    const allSounds = soundsRef.current;
    for (const ev of layer.events) {
      const jitter = (Math.random() - 0.5) * 2 * layer.timingJitter;
      window.setTimeout(() => {
        if (!palimpsestLoopRef.current.has(layer.id)) return;
        const current = palimpsestLayersRef.current.find((l) => l.id === layer.id);
        if (!current) return;
        const snd = allSounds.find((s) => s.id === ev.soundId);
        if (!snd) return;
        const nd = snd.nodes.find((n) => n.id === ev.nodeId)
          // graceful fallback: closest node in same layer if the original died
          ?? snd.nodes.filter((n) => n.layerIndex === (snd.nodes.find((x) => x.id === ev.nodeId)?.layerIndex ?? 0))[0]
          ?? snd.nodes[Math.floor(Math.random() * snd.nodes.length)];
        if (nd) playPalimpsestGrainRef.current?.(snd, nd, current.decayLevel, current.pitchDrift);
      }, Math.max(0, ev.relativeTime + jitter));
    }

    const cont = window.setTimeout(() => {
      if (!palimpsestLoopRef.current.has(layer.id)) return;
      const current = palimpsestLayersRef.current.find((l) => l.id === layer.id);
      if (current) schedulePalimpsestRef.current?.(current);
    }, Math.max(600, layer.duration + 250));

    palimpsestLoopRef.current.set(layer.id, cont);
  }, []);

  useEffect(() => { schedulePalimpsestRef.current = schedulePalimpsestLayer; }, [schedulePalimpsestLayer]);

  // ── Palimpsest actions ────────────────────────────────────────────────
  const startPalimpsestRecording = useCallback(() => {
    palimpsestEventsRef.current = [];
    palimpsestNodeThrottleRef.current.clear();
    palimpsestStartRef.current = performance.now();
    setIsPalimpsestRecording(true);
  }, []);

  const stopPalimpsestRecording = useCallback(() => {
    if (!isPalimpsestRecordingRef.current || palimpsestStartRef.current === null) return;
    setIsPalimpsestRecording(false);

    const duration = performance.now() - palimpsestStartRef.current;
    palimpsestStartRef.current = null;
    const events   = [...palimpsestEventsRef.current];
    palimpsestEventsRef.current = [];
    palimpsestNodeThrottleRef.current.clear();

    if (events.length === 0) return; // nothing recorded

    // Assign hue from the active sound (or random)
    const activeSound = soundsRef.current.find((s) => s.id !== undefined);
    const hue = activeSound?.hue ?? SOUND_PALETTE[0].hue;

    const newLayer: PalimpsestLayer = {
      id: uid(),
      events,
      duration,
      decayLevel: 1.0,
      pitchDrift: 0,
      timingJitter: 0,
      hue,
    };

    setPalimpsestLayers((prev) => {
      // Age all existing layers: reduce gain, increase drift/jitter
      const aged = prev
        .map((l) => ({
          ...l,
          decayLevel:   l.decayLevel   * PALIMPSEST_DECAY,
          pitchDrift:   l.pitchDrift   + PALIMPSEST_DRIFT_STEP,
          timingJitter: l.timingJitter + PALIMPSEST_JITTER_STEP,
        }))
        .filter((l) => l.decayLevel >= PALIMPSEST_MIN_DECAY); // prune truly forgotten layers

      // Hard cap on concurrent layers
      const all = [...aged, newLayer];
      if (all.length > MAX_PALIMPSEST_LAYERS) {
        // Evict oldest (first in array) — stop its loop
        const evict = all.shift()!;
        palimpsestLoopRef.current.delete(evict.id);
      }
      return all;
    });

    // Start the new layer's loop
    schedulePalimpsestRef.current?.(newLayer);
  }, []);

  const clearPalimpsest = useCallback(() => {
    palimpsestLoopRef.current.forEach((h) => window.clearTimeout(h));
    palimpsestLoopRef.current.clear();
    setPalimpsestLayers([]);
    setIsPalimpsestRecording(false);
    palimpsestStartRef.current = null;
    palimpsestEventsRef.current = [];
  }, []);

  // Cleanup all palimpsest loops on unmount
  useEffect(() => () => {
    palimpsestLoopRef.current.forEach((h) => window.clearTimeout(h));
    palimpsestLoopRef.current.clear();
  }, []);

  // ── Loop playback with degradation ────────────────────────────────────
  useEffect(() => {
    if (!isLooping || loopEvents.length === 0) return;

    const dropProb = 1 - Math.pow(0.8, loopIteration);
    if (dropProb >= 0.97) { setIsLooping(false); return; }

    const maxJitter = loopIteration * 55;
    const loopDuration = Math.max(
      1200,
      loopEvents[loopEvents.length - 1].relativeTime + 900,
    );
    const handles: number[] = [];

    for (const ev of loopEvents) {
      if (Math.random() < dropProb) continue;
      const jitter = (Math.random() - 0.5) * maxJitter;
      handles.push(
        window.setTimeout(() => {
          const snd = loopSoundsRef.current.find((s) => s.id === ev.soundId);
          const nd  = snd?.nodes.find((n) => n.id === ev.nodeId);
          if (snd && nd) playGrainRef.current?.(snd, nd);
        }, Math.max(0, ev.relativeTime + jitter)),
      );
    }

    handles.push(
      window.setTimeout(() => setLoopIteration((i) => i + 1), loopDuration),
    );

    return () => handles.forEach(clearTimeout);
  }, [isLooping, loopEvents, loopIteration]);

  // ── File loading ──────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setLoadError(null);
      setIsLoading(true);
      const ctx = ensureContext();
      if (!ctx) { setIsLoading(false); return; }
      try {
        const newSounds: Sound[] = [];
        for (const file of list) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
            normalizeBuffer(buffer);
            const id = uid();
            const layers = 6;
            const spread = 0.38;
            const paletteEntry = SOUND_PALETTE[(soundsRef.current.length + newSounds.length) % SOUND_PALETTE.length];
            const sound: Sound = {
              id, name: file.name, buffer,
              color: paletteEntry.hex,
              hue: paletteEntry.hue,
              layers, grainMs: 120, spread,
              layerPitches: analyzeLayerPitches(buffer, layers),
              pitchJitter: 0.2, gain: 0.8,
              nodes: buildNodes(id, layers, spread),
            };
            newSounds.push(sound);
          } catch (err) {
            console.error("Failed to decode", file.name, err);
            setLoadError(`Could not decode "${file.name}". Try WAV, MP3, OGG, or FLAC.`);
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
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const updateActiveSound = useCallback(
    (patch: Partial<Sound>) => {
      setSounds((prev) => {
        const targetId = activeSoundId ?? prev[0]?.id;
        if (targetId === undefined) return prev;
        return prev.map((s) => {
          if (s.id !== targetId) return s;
          const merged = { ...s, ...patch } as Sound;
          const layersChanged = patch.layers !== undefined && patch.layers !== s.layers;
          const spreadChanged = patch.spread !== undefined && patch.spread !== s.spread;
          if (layersChanged || spreadChanged) merged.nodes = buildNodes(s.id, merged.layers, merged.spread);
          if (layersChanged) merged.layerPitches = analyzeLayerPitches(s.buffer, merged.layers);
          return merged;
        });
      });
    },
    [activeSoundId],
  );

  const remapAllSounds = useCallback(() => {
    setSounds((prev) =>
      prev.map((s) => ({ ...s, nodes: buildNodes(s.id, s.layers, s.spread) })),
    );
  }, []);

  const removeSound = useCallback((id: string) => {
    // Stop any crystal timers whose sound is being removed
    setCrystals((prev) => {
      prev.filter((c) => c.soundId === id).forEach((c) => {
        const h = crystalTimersRef.current.get(c.id);
        if (h !== undefined) { window.clearTimeout(h); crystalTimersRef.current.delete(c.id); }
      });
      return prev.filter((c) => c.soundId !== id);
    });
    setSounds((prev) => prev.filter((s) => s.id !== id));
    setActiveSoundId((cur) => (cur === id ? null : cur));
  }, []);

  // ── Auto-play ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlay) {
      if (autoPlayTimerRef.current !== null) {
        window.clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      return;
    }
    if (sounds.length === 0) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const list = soundsRef.current;
      if (list.length === 0) return;
      const sound = list[Math.floor(Math.random() * list.length)];
      if (sound && sound.nodes.length > 0) {
        const node = sound.nodes[Math.floor(Math.random() * sound.nodes.length)];
        playGrainRef.current?.(sound, node);
        addTraceRef.current(node, sound.hue);
        consumeNodeLifeRef.current(sound.id, node.id);
      }
      const interval = 1000 / Math.max(0.5, autoDensityRef.current);
      const jitter = interval * (0.5 + Math.random());
      autoPlayTimerRef.current = window.setTimeout(tick, jitter);
    };

    autoPlayTimerRef.current = window.setTimeout(tick, 200);
    return () => {
      cancelled = true;
      if (autoPlayTimerRef.current !== null) {
        window.clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [autoPlay, sounds.length]);

  const activeSound = useMemo(
    () => sounds.find((s) => s.id === activeSoundId) ?? null,
    [sounds, activeSoundId],
  );

  const onNodeTrigger = useCallback(
    (sound: Sound, node: LayerNode) => {
      setActiveSoundId(sound.id);
      playGrain(sound, node);
      addTrace(node, sound.hue);
      consumeNodeLife(sound.id, node.id);
      recordEvent(sound.id, node.id);
    },
    [playGrain, addTrace, consumeNodeLife, recordEvent],
  );

  return {
    sounds, activeSoundId, setActiveSoundId, activeSound,
    isLoading, loadError,
    masterVolume, setMasterVolume,
    autoPlay, setAutoPlay,
    autoDensity, setAutoDensity,
    isLooping, isRecording, loopIteration,
    startRecording, stopRecording, clearLoop,
    // Bus A reverb
    reverbMix,   setReverbMix,
    reverbSize,  setReverbSize,
    reverbDrive, setReverbDrive,
    grainOutputLevel, setGrainOutputLevel,
    // Bus B diffusion
    diffusionReverbMix,   setDiffusionReverbMix,
    diffusionReverbSize,  setDiffusionReverbSize,
    diffusionReverbDrive, setDiffusionReverbDrive,
    diffusionOutputLevel, setDiffusionOutputLevel,
    diffusionFeedback,    setDiffusionFeedback,
    diffusionDelayMs,     setDiffusionDelayMs,
    // Bus C spectral
    spectralReverbMix,    setSpectralReverbMix,
    spectralReverbSize,   setSpectralReverbSize,
    spectralReverbDrive,  setSpectralReverbDrive,
    spectralOutputLevel,  setSpectralOutputLevel,
    // Bus D layer record
    layerReverbMix,       setLayerReverbMix,
    layerReverbSize,      setLayerReverbSize,
    layerReverbDrive,     setLayerReverbDrive,
    layerOutputLevel,     setLayerOutputLevel,
    // Handlers
    onFileInput, onDrop,
    updateActiveSound, remapAllSounds, removeSound,
    flash, traces,
    onNodeTrigger,
    playDiffusionGrain,
    onWallBounce,
    // Spectral crystals
    crystals, captureCrystal, removeCrystal,
    crystalLevel, setCrystalLevel,
    // Palimpsest layering
    palimpsestLayers, isPalimpsestRecording,
    startPalimpsestRecording, stopPalimpsestRecording, clearPalimpsest,
  };
}

export type GranularViewModel = ReturnType<typeof useGranularApp>;
