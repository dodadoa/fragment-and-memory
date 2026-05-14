/**
 * Domain types for Layer Word granular engine (logic layer).
 */

export type LayerNode = {
  id: string;
  soundId: string;
  layerIndex: number;
  x: number;
  y: number;
  rateJitter: number;
  pan: number;
  life: number;
};

export type Trace = {
  id: string;
  x: number;
  y: number;
  layerIndex: number;
  hue: number;
  createdAt: number;
};

export type LoopEvent = {
  soundId: string;
  nodeId: string;
  relativeTime: number;
};

/**
 * Fixed colour palette — assigned to sounds in order, cycling.
 * Each entry carries both the hex display colour and the approximate
 * HSL hue used for the knob arc tint.
 */
/** Grain / node colours — assigned to sounds in order, cycling. */
export const SOUND_PALETTE = [
  { hex: "#ef476f", hue: 345 }, // Bubblegum Pink
  { hex: "#ffd166", hue: 44  }, // Royal Gold
  { hex: "#06d6a0", hue: 162 }, // Emerald
  { hex: "#118ab2", hue: 198 }, // Ocean Blue
  { hex: "#073b4c", hue: 196 }, // Dark Teal
] as const;

export type Sound = {
  id: string;
  name: string;
  buffer: AudioBuffer;
  color: string;  // hex from SOUND_PALETTE
  hue: number;    // HSL hue from SOUND_PALETTE — used for knob arc tint
  layers: number;
  grainMs: number;
  spread: number;
  layerPitches: (number | null)[];
  pitchJitter: number;
  gain: number;
  nodes: LayerNode[];
};

/**
 * Spectral crystal — a frozen sonic moment captured by the diffusion agent.
 * Dense short grains are retriggered from the same buffer offset, creating
 * a held drone that slowly blurs through the reverb/feedback field.
 */
export type SpectralCrystal = {
  id: string;
  soundId: string;
  hue: number;
  bufferOffset: number;  // exact frozen position in the audio buffer (seconds)
  pan: number;
  cx: number;            // canvas x at capture time (normalised 0–1)
  cy: number;            // canvas y at capture time (normalised 0–1)
};

export const MAX_CRYSTALS = 4;

/**
 * Palimpsest layer — a voice recording stacked over previous recordings.
 * Each new recording decays all older layers (lower gain, more pitch drift,
 * more timing jitter). Older layers remain audible but become progressively
 * more ghostly, literalising "memory written over memory".
 */
export type PalimpsestLayer = {
  id: string;
  events: LoopEvent[];
  duration: number;       // total recording length in ms
  decayLevel: number;     // 0–1; multiplied by PALIMPSEST_DECAY on each new recording
  pitchDrift: number;     // accumulated extra pitch jitter (grows with age)
  timingJitter: number;   // accumulated extra timing jitter in ms
  hue: number;            // display colour (inherits from the active sound at capture time)
};

export const MAX_PALIMPSEST_LAYERS  = 10;
export const PALIMPSEST_DECAY       = 0.68;  // per new-layer multiplier — faster ghosting as stack grows
export const PALIMPSEST_DRIFT_STEP  = 0.07;  // pitch-drift increase per layer added
export const PALIMPSEST_JITTER_STEP = 20;    // ms of extra timing jitter per layer added
export const PALIMPSEST_MIN_DECAY   = 0.04;  // layers below this are removed (truly forgotten)

export const NODES_PER_LAYER = 6;
export const MIN_GRAIN_MS = 20;
export const MAX_GRAIN_MS = 2000;
export const MAX_NODE_LIFE = 8;
export const TRACE_DURATION_MS = 13000;
