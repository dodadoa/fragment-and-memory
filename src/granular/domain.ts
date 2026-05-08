/**
 * Pure domain logic — no React, no Web Audio graph construction.
 */

import type { LayerNode } from "./types";
import { MAX_NODE_LIFE, NODES_PER_LAYER } from "./types";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function spawnNode(soundId: string, layerIndex: number, spread: number): LayerNode {
  const factor = Math.max(0.1, Math.min(1, spread * 2));
  const pad = 0.08;
  const lx = 0.5 + (Math.random() - 0.5) * factor;
  const ly = 0.5 + (Math.random() - 0.5) * factor;
  return {
    id: uid(),
    soundId,
    layerIndex,
    x: Math.max(pad, Math.min(1 - pad, lx)),
    y: Math.max(pad, Math.min(1 - pad, ly)),
    rateJitter: 0.97 + Math.random() * 0.06,
    pan: (Math.random() - 0.5) * 1.6,
    life: MAX_NODE_LIFE,
  };
}

export function normalizeBuffer(buffer: AudioBuffer): void {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak > 0 && peak !== 1) {
    const scale = 1 / peak;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
  }
}

export function detectPitch(
  data: Float32Array,
  sampleRate: number,
  startSample: number,
  endSample: number,
): number | null {
  const WIN = 4096;
  const segLen = endSample - startSample;
  const winStart = startSample + Math.max(0, Math.floor((segLen - WIN) / 2));
  const winEnd = Math.min(winStart + WIN, endSample);
  const len = winEnd - winStart;

  let rms = 0;
  for (let i = winStart; i < winEnd; i++) rms += data[i] * data[i];
  rms = Math.sqrt(rms / len);
  if (rms < 0.008) return null;

  const minLag = Math.max(1, Math.floor(sampleRate / 2000));
  const maxLag = Math.min(Math.floor(sampleRate / 50), Math.floor(len / 2));

  let bestCorr = -Infinity;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const n = len - lag;
    for (let i = 0; i < n; i++) corr += data[winStart + i] * data[winStart + i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag < 0) return null;
  if (bestCorr / (len * rms * rms) < 0.25) return null;

  return sampleRate / bestLag;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function noteFromHz(hz: number): string {
  const midi = 12 * Math.log2(hz / 440) + 69;
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function analyzeLayerPitches(buffer: AudioBuffer, layers: number): (number | null)[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const layerSamples = Math.floor(buffer.length / layers);
  return Array.from({ length: layers }, (_, i) => {
    const start = i * layerSamples;
    return detectPitch(data, sr, start, Math.min(start + layerSamples, buffer.length));
  });
}

export function buildNodes(
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
        rateJitter: 0.97 + Math.random() * 0.06,
        life: MAX_NODE_LIFE,
        pan: (Math.random() - 0.5) * 1.6,
      });
    }
  }
  return nodes;
}
