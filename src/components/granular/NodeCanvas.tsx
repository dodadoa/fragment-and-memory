import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LayerNode, Sound, SpectralCrystal } from "@/granular/types";
import {
  MAX_NODE_LIFE,
  TRACE_DURATION_MS,
  type Trace,
} from "@/granular/types";
import { noteFromHz } from "@/granular/domain";

// Agent movement speed (canvas-widths per second)
const SPEED = 0.38;
// Radius resize speed (canvas-widths per second while Q/E held)
const RADIUS_SPEED = 0.09;
const RADIUS_MIN   = 0.04;
const RADIUS_MAX   = 0.42;

export function NodeCanvas({
  sounds,
  activeSoundId,
  flash,
  traces,
  onTrigger,
  onDiffusionTrigger,
  onWallBounce,
  crystals,
  onCaptureCrystal,
  onRemoveCrystal,
}: {
  sounds: Sound[];
  activeSoundId: string | null;
  flash: Record<string, number>;
  traces: Trace[];
  onTrigger: (sound: Sound, node: LayerNode) => void;
  onDiffusionTrigger: (sound: Sound, node: LayerNode, strength: number) => void;
  onWallBounce: () => void;
  crystals: SpectralCrystal[];
  onCaptureCrystal: (sound: Sound, node: LayerNode, cx: number, cy: number) => void;
  onRemoveCrystal: (id: string) => void;
}) {
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  const maxLayers = useMemo(
    () => (sounds.length === 0 ? 0 : Math.max(...sounds.map((s) => s.layers))),
    [sounds],
  );

  const nodesByLayer = useMemo(() => {
    const buckets: { sound: Sound; node: LayerNode }[][] = Array.from(
      { length: maxLayers },
      () => [],
    );
    for (const sound of sounds) {
      for (const node of sound.nodes) {
        if (node.layerIndex < maxLayers) buckets[node.layerIndex].push({ sound, node });
      }
    }
    return buckets;
  }, [sounds, maxLayers]);

  const refSound = useMemo(
    () => sounds.find((s) => s.id === activeSoundId) ?? sounds[0] ?? null,
    [sounds, activeSoundId],
  );

  // ── DOM refs ─────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const rowRefs   = useRef<(HTMLDivElement | null)[]>([]);

  // Stable refs for the animation loop (no dependency restarts)
  const nodesByLayerRef       = useRef(nodesByLayer);
  const onDiffusionTriggerRef = useRef(onDiffusionTrigger);
  const onWallBounceRef       = useRef(onWallBounce);
  const onCaptureCrystalRef   = useRef(onCaptureCrystal);
  useEffect(() => { nodesByLayerRef.current = nodesByLayer; }, [nodesByLayer]);
  useEffect(() => { onDiffusionTriggerRef.current = onDiffusionTrigger; }, [onDiffusionTrigger]);
  useEffect(() => { onWallBounceRef.current = onWallBounce; }, [onWallBounce]);
  useEffect(() => { onCaptureCrystalRef.current = onCaptureCrystal; }, [onCaptureCrystal]);

  // Stable "capture at current agent position" — reads everything via refs
  const captureAtAgentRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    captureAtAgentRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect    = canvas.getBoundingClientRect();
      const { x: ax, y: ay } = agentPosRef.current;
      const agentPx = ax * rect.width;
      const agentPy = ay * rect.height;

      let bestSound: Sound | null = null;
      let bestNode: LayerNode | null = null;
      let minDist = Infinity;

      const layers = nodesByLayerRef.current;
      for (let k = 0; k < layers.length; k++) {
        const rowEl = rowRefs.current[k];
        if (!rowEl) continue;
        const rr      = rowEl.getBoundingClientRect();
        const rowLeft = rr.left - rect.left;
        const rowTop  = rr.top  - rect.top;
        for (const { sound, node } of layers[k]) {
          const nx = rowLeft + node.x * rr.width;
          const ny = rowTop  + node.y * rr.height;
          const d  = Math.hypot(agentPx - nx, agentPy - ny);
          if (d < minDist) { minDist = d; bestSound = sound; bestNode = node; }
        }
      }
      if (bestSound && bestNode) {
        onCaptureCrystalRef.current(bestSound, bestNode, ax, ay);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — all reads via refs

  // ── Single diffusion agent (the "ear") ────────────────────────────────
  // Starts at canvas center, walks with arrow keys, hears all nearby nodes.
  const [agentPos, setAgentPos] = useState({ x: 0.5, y: 0.5 });
  const agentPosRef = useRef({ x: 0.5, y: 0.5 });

  // Hearing-radius — mutable in the animation loop (Q shrinks, E grows)
  const [agentRadius, setAgentRadius] = useState(0.12);
  const agentRadiusRef = useRef(0.12);

  // Nodes currently inside the agent's hearing radius (for glow rendering)
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());
  const prevTouchedRef = useRef<Set<string>>(new Set());

  // Per-node cooldown: last trigger time in performance.now() ms
  const nodeCooldownRef = useRef(new Map<string, number>());

  // Animation loop handle + timing
  const animRef     = useRef(0);
  const lastTimeRef = useRef(0);

  // ── Input state ───────────────────────────────────────────────────────
  const keysRef     = useRef(new Set<string>());
  const isDragging  = useRef(false);

  // Keyboard capture
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      // Don't hijack keys while the user types in a sidebar control
      if ((e.target as Element).closest("input,textarea,select")) return;
      keysRef.current.add(e.key);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
      // F → freeze a spectral crystal at the agent's current position
      if (e.key === "f" || e.key === "F") captureAtAgentRef.current?.();
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
    };
  }, []);

  // ── Main animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (maxLayers === 0) return;

    lastTimeRef.current = performance.now();

    const tick = (nowMs: number) => {
      const dt = Math.min((nowMs - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = nowMs;

      // ── Move agent via held keys ──────────────────────────────────────
      const keys = keysRef.current;
      let { x, y } = agentPosRef.current;
      const prevY = y;

      if (keys.has("ArrowUp")    || keys.has("w") || keys.has("W")) y -= SPEED * dt;
      if (keys.has("ArrowDown")  || keys.has("s") || keys.has("S")) y += SPEED * dt;
      if (keys.has("ArrowLeft")  || keys.has("a") || keys.has("A")) x -= SPEED * dt;
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) x += SPEED * dt;

      x = Math.max(0.01, Math.min(0.99, x));
      y = Math.max(0.01, Math.min(0.99, y));

      // Q → shrink scope  /  E → grow scope
      let r = agentRadiusRef.current;
      if (keys.has("q") || keys.has("Q")) r -= RADIUS_SPEED * dt;
      if (keys.has("e") || keys.has("E")) r += RADIUS_SPEED * dt;
      r = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, r));
      const radiusChanged = r !== agentRadiusRef.current;
      agentRadiusRef.current = r;

      // Layer-wall crossing → sound bounces off the wall and feeds back
      const layerH  = 1 / maxLayers;
      const prevRow = Math.floor(prevY / layerH);
      const currRow = Math.min(maxLayers - 1, Math.floor(y / layerH));
      if (prevRow !== currRow) onWallBounceRef.current();

      const prevX = agentPosRef.current.x;
      const prevY2 = agentPosRef.current.y;
      agentPosRef.current = { x, y };
      const posChanged = x !== prevX || y !== prevY2;

      // ── Proximity-based continuous triggering ─────────────────────────
      // Every node within AGENT_RADIUS emits toward the agent continuously.
      // Strength (0–1) = 1 − normalised distance, used as gain weight.
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current = requestAnimationFrame(tick); return; }

      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (W === 0 || H === 0) { animRef.current = requestAnimationFrame(tick); return; }

      const agentPx  = x * W;
      const agentPy  = y * H;
      const agentRpx = agentRadiusRef.current * W;
      const nowPerf  = performance.now();

      const newTouched = new Set<string>();
      const layers = nodesByLayerRef.current;

      for (let k = 0; k < layers.length; k++) {
        const rowEl = rowRefs.current[k];
        if (!rowEl) continue;
        const rr      = rowEl.getBoundingClientRect();
        const rowLeft = rr.left - rect.left;
        const rowTop  = rr.top  - rect.top;

        for (const { sound, node } of layers[k]) {
          const nx   = rowLeft + node.x * rr.width;
          const ny   = rowTop  + node.y * rr.height;
          const dist = Math.hypot(agentPx - nx, agentPy - ny);

          if (dist < agentRpx) {
            const strength = 1 - dist / agentRpx;
            newTouched.add(node.id);

            // Closer nodes retrigger faster; always some diffusion even at rest
            const cooldownMs = Math.max(50, 185 - strength * 135);
            const lastTrig   = nodeCooldownRef.current.get(node.id) ?? 0;
            if (nowPerf - lastTrig > cooldownMs) {
              onDiffusionTriggerRef.current(sound, node, strength);
              nodeCooldownRef.current.set(node.id, nowPerf);
            }
          }
        }
      }

      // Only re-render when position or touched-set actually changed
      const prev = prevTouchedRef.current;
      const touchedChanged =
        newTouched.size !== prev.size ||
        [...newTouched].some((id) => !prev.has(id)) ||
        [...prev].some((id) => !newTouched.has(id));

      if (posChanged || touchedChanged || radiusChanged) {
        prevTouchedRef.current = newTouched;
        setAgentPos({ x, y });
        setTouchedIds(newTouched);
        if (radiusChanged) setAgentRadius(r);
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  // Restart only when layer count changes; callbacks accessed via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLayers]);

  // ── Mouse/touch drag of the agent ────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (target.closest("[data-node]")) return;
    if (sounds.length === 0) return;
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveAgentToPointer(e);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || e.buttons !== 1) return;
    moveAgentToPointer(e);
  };
  const handlePointerUp = () => { isDragging.current = false; };

  const moveAgentToPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top)  / rect.height));
    agentPosRef.current = { x, y };
    setAgentPos({ x, y });
  };

  if (sounds.length === 0) return null;

  // ── Render ────────────────────────────────────────────────────────────
  const agentPxPct  = agentPos.x * 100;
  const agentPyPct  = agentPos.y * 100;
  const agentRadPct = agentRadius * 100;
  // Scope percentage for the label (0–100 relative to max range)
  const scopePct = Math.round(((agentRadius - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100);

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 flex flex-col p-4 gap-[3px] overflow-hidden select-none"
      style={{ touchAction: "none", cursor: "crosshair" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Keyframes injected once */}
      <style>{`
        @keyframes sonar {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.38; }
          100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0; }
        }
        @keyframes sonar-inner {
          0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.22; }
          100% { transform: translate(-50%,-50%) scale(1.9); opacity: 0; }
        }
        @keyframes crystal-pulse {
          0%,100% { opacity: 0.80; transform: translate(-50%,-50%) rotate(45deg) scale(1); }
          50%      { opacity: 0.42; transform: translate(-50%,-50%) rotate(45deg) scale(0.82); }
        }
        @keyframes crystal-ring {
          0%   { transform: translate(-50%,-50%) rotate(45deg) scale(1);   opacity: 0.38; }
          100% { transform: translate(-50%,-50%) rotate(45deg) scale(3.2); opacity: 0; }
        }
      `}</style>

      {/* Legend + axis */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {sounds.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1.5 max-w-[180px]"
              style={{ fontSize: fs(11), color: s.color }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{
                  background: s.color,
                  boxShadow: `0 0 6px ${s.color}88, 0 0 16px ${s.color}44`,
                }}
              />
              <span className="truncate">{s.name}</span>
            </span>
          ))}
        </div>
        <span className="shrink-0 ml-4" style={{ fontSize: fs(10), color: "var(--ink-3)", letterSpacing: "0.08em" }}>
          early ^
        </span>
      </div>

      {/* Layer rows */}
      {nodesByLayer.map((entries, k) => {
        const depth        = maxLayers > 1 ? k / (maxLayers - 1) : 1;
        const baseNodeSize = 6 + depth * 12;
        const detectedHz   = refSound?.layerPitches[k] ?? null;
        const pitchLabel   = detectedHz != null ? noteFromHz(detectedHz) : null;

        return (
          <div
            key={k}
            ref={(el) => { rowRefs.current[k] = el; }}
            className="flex-1 relative rounded-sm overflow-hidden min-h-[24px]"
            style={{
              backgroundColor: `rgba(255,255,255,${0.1 + depth * 0.1})`,
              border: `1px solid rgba(255,255,255,${0.14 + depth * 0.1})`,
              boxShadow: depth > 0.5 ? `inset 0 1px 8px rgba(255,255,255,${depth * 0.1})` : "none",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <span
              className="pointer-events-none select-none absolute left-2 top-1 tabular-nums"
              style={{ fontSize: fs(10), fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}
            >
              {k}
            </span>
            {pitchLabel && (
              <span
                className="pointer-events-none select-none absolute right-2 top-1 tabular-nums"
                style={{ fontSize: fs(10), fontFamily: "var(--font-mono)", color: refSound?.color ?? "var(--ink-3)" }}
              >
                {pitchLabel}
              </span>
            )}

            {/* Trace marks */}
            {traces
              .filter((tr) => tr.layerIndex === k)
              .map((tr) => {
                // tr.hue is stored as the sound's hue int — look up matching palette color
                const trColor = sounds.find((s) => s.hue === tr.hue)?.color ?? `hsl(${tr.hue} 65% 52%)`;
                return (
                  <div
                    key={tr.id}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      left: `${tr.x * 100}%`,
                      top:  `${tr.y * 100}%`,
                      width: 20, height: 20,
                      transform: "translate(-50%,-50%)",
                      background: trColor,
                      animation: `traceFade ${TRACE_DURATION_MS}ms ease-out forwards`,
                    }}
                  />
                );
              })}

            {/* Nodes */}
            {entries.map(({ sound, node }) => {
              const isActive   = activeSoundId === sound.id;
              const flashed    = Boolean(flash[node.id]);
              const touched    = touchedIds.has(node.id);
              const lifeRatio  = node.life / MAX_NODE_LIFE;
              const size       = flashed || touched ? baseNodeSize * 2.2 : baseNodeSize;
              const color      = sound.color;            // exact palette hex
              const colorAlpha = `${color}cc`;           // 80% opacity variant
              const colorGlow  = `${color}55`;           // 33% for spread glow
              const opacity    = flashed || touched
                ? 0.92
                : isActive
                  ? 0.25 + lifeRatio * 0.55
                  : 0.12 + lifeRatio * 0.32;
              const boxShadow  = touched
                ? `0 0 ${size * 1.8}px ${colorAlpha}, 0 0 ${size * 4}px ${colorGlow}`
                : flashed
                  ? `0 0 ${size * 1.2}px ${colorAlpha}`
                  : `0 0 ${size * 0.5}px ${colorGlow}`;
              return (
                <button
                  key={node.id}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onTrigger(sound, node); }}
                  onPointerEnter={(e) => { if (e.buttons === 1) onTrigger(sound, node); }}
                  data-node="true"
                  aria-label={`Sound ${sound.name}, layer ${k}, life ${node.life}`}
                  className="absolute rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-100 ease-out cursor-pointer focus:outline-none"
                  style={{
                    left: `${node.x * 100}%`,
                    top:  `${node.y * 100}%`,
                    width: size, height: size,
                    backgroundColor: color,
                    boxShadow, opacity,
                  }}
                />
              );
            })}
          </div>
        );
      })}

      {/* Bottom label */}
      <div className="flex justify-end shrink-0 mt-1">
        <span style={{ fontSize: fs(10), color: "var(--ink-3)", letterSpacing: "0.08em" }}>v late</span>
      </div>

      {/* Key hint */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
        style={{ fontSize: fs(11), color: "var(--ink-4)", letterSpacing: "0.04em" }}
      >
        arrow keys: move / Q+E: scope / F: freeze
      </div>

      {/* ── Spectral crystals ──────────────────────────────────────────── */}
      {crystals.map((crystal) => {
        const paletteColor = sounds.find((s) => s.hue === crystal.hue)?.color
          ?? `hsl(${crystal.hue} 55% 48%)`;
        const color      = paletteColor;
        const colorSoft  = `${paletteColor}99`;
        return (
          <div key={crystal.id}>
            {/* Expanding ring */}
            <div
              className="absolute pointer-events-none z-20"
              style={{
                left: `${crystal.cx * 100}%`, top: `${crystal.cy * 100}%`,
                width: 18, height: 18,
                background: "transparent",
                border: `1px solid ${colorSoft}`,
                animation: "crystal-ring 2.2s ease-out infinite",
              }}
            />
            {/* Diamond body */}
            <div
              className="absolute z-20"
              style={{
                left: `${crystal.cx * 100}%`, top: `${crystal.cy * 100}%`,
                width: 13, height: 13,
                background: color,
                boxShadow: `0 0 8px ${colorSoft}, 0 0 20px hsl(${crystal.hue} 45% 55% / 0.28)`,
                animation: "crystal-pulse 2.2s ease-in-out infinite",
                cursor: "pointer",
              }}
              title="click to release"
              onClick={() => onRemoveCrystal(crystal.id)}
            />
            {/* Index label */}
            <div
              className="absolute pointer-events-none z-20 whitespace-nowrap"
              style={{
                left: `calc(${crystal.cx * 100}% + 11px)`,
                top: `calc(${crystal.cy * 100}% - 7px)`,
                fontSize: fs(10), color, fontStyle: "italic", lineHeight: 1,
              }}
            >
              {crystals.indexOf(crystal) + 1}
            </div>
          </div>
        );
      })}

      {/* ── Diffusion agent — the single "ear" ───────────────────────── */}
      {/* Outer sonar ring */}
      <div
        className="absolute rounded-full pointer-events-none z-30"
        style={{
          left: `${agentPxPct}%`, top: `${agentPyPct}%`,
          width: `${agentRadPct * 2}%`, aspectRatio: "1",
          border: "1px solid rgba(60,48,38,0.14)",
          animation: "sonar 1.8s ease-out infinite",
        }}
      />
      {/* Inner sonar ring */}
      <div
        className="absolute rounded-full pointer-events-none z-30"
        style={{
          left: `${agentPxPct}%`, top: `${agentPyPct}%`,
          width: `${agentRadPct * 2}%`, aspectRatio: "1",
          border: "1px solid rgba(60,48,38,0.09)",
          animation: "sonar-inner 1.8s 0.6s ease-out infinite",
        }}
      />
      {/* Agent body — whisper of ink, soft inward shadow */}
      <div
        className="absolute rounded-full z-30"
        style={{
          left: `${agentPxPct}%`, top: `${agentPyPct}%`,
          width: `${agentRadPct * 2}%`, aspectRatio: "1",
          transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle at center, rgba(50,40,30,0.04) 0%, rgba(50,40,30,0.01) 60%, transparent 100%)",
          border: "1px solid rgba(60,48,38,0.32)",
          boxShadow: "0 0 22px rgba(60,48,38,0.06), inset 0 0 16px rgba(60,48,38,0.03)",
          cursor: "grab",
          pointerEvents: "none",
        }}
      />
      {/* Scope size label */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          left: `${agentPxPct}%`, top: `${agentPyPct}%`,
          transform: `translate(-50%, calc(-50% + ${agentRadPct * 0.55}%))`,
          fontSize: fs(10), lineHeight: 1,
          color: "rgba(60,48,38,0.35)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {scopePct}%
      </div>

      {/* Centre crosshair */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{ left: `${agentPxPct}%`, top: `${agentPyPct}%`, transform: "translate(-50%,-50%)", width: 10, height: 10 }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(60,48,38,0.35)", transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", top: "50%", left: 0, height: 1, width: "100%", background: "rgba(60,48,38,0.35)", transform: "translateY(-50%)" }} />
      </div>
    </div>
  );
}
