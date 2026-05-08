import { useEffect, useRef } from "react";

// ── SVG knob geometry ────────────────────────────────────────────────────────
// SVG angle convention: 0° = right (3 o'clock), increases clockwise.
// Min position: 135° SVG ≈ 7:30 on a clock (lower-left)
// Max position: 45°  SVG ≈ 4:30 on a clock (lower-right)
// Sweep: 270° clockwise through 12 o'clock
const SIZE  = 34;
const CX    = SIZE / 2;
const CY    = SIZE / 2;
const R     = 11;
const A_MIN = 135;
const SWEEP = 270;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [
    +(CX + r * Math.cos(rad)).toFixed(3),
    +(CY + r * Math.sin(rad)).toFixed(3),
  ];
}

function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(r, fromDeg);
  const [x2, y2] = polar(r, toDeg);
  // Clockwise angular span
  const span = ((toDeg - fromDeg) % 360 + 360) % 360;
  const large = span > 180 ? 1 : 0;
  return `M${x1},${y1} A${r},${r},0,${large},1,${x2},${y2}`;
}

function snap(val: number, min: number, max: number, step: number) {
  return Math.max(min, Math.min(max, Math.round((val - min) / step) * step + min));
}

// Pre-computed — never changes
const TRACK_D = arcPath(R, A_MIN, A_MIN + SWEEP);

// ─────────────────────────────────────────────────────────────────────────────

export function Slider({
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
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  const t       = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillEnd = A_MIN + t * SWEEP;
  const [dotX, dotY] = polar(R - 2, fillEnd);
  const fillD   = t > 0.005 ? arcPath(R, A_MIN, fillEnd) : null;

  // Stable refs so event listeners never go stale
  const valRef = useRef(value);
  const cbRef  = useRef(onChange);
  useEffect(() => { valRef.current = value;    }, [value]);
  useEffect(() => { cbRef.current  = onChange; }, [onChange]);

  // Wheel — attached via ref to allow passive:false (prevents sidebar scroll)
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      cbRef.current(snap(valRef.current + dir * step, min, max, step));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, step]);

  // Drag: vertical mouse movement, up = increase
  const dragRef = useRef<{ y0: number; v0: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { y0: e.clientY, v0: valRef.current };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.y0 - me.clientY;
      cbRef.current(snap(dragRef.current.v0 + (dy / 120) * (max - min), min, max, step));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="flex flex-col items-center gap-[1px] select-none cursor-ns-resize"
      onMouseDown={handleMouseDown}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Track — warm light gray groove */}
        <path
          d={TRACK_D}
          fill="none"
          stroke="rgba(100,88,76,0.28)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Filled arc — Dusk Blue tint matching interface palette */}
        {fillD && (
          <path
            d={fillD}
            fill="none"
            stroke={`hsl(${hue} 88% 40%)`}
            strokeWidth="2"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 2px hsl(${hue} 80% 38% / 0.5))` }}
          />
        )}
        {/* Indicator dot */}
        <circle cx={dotX} cy={dotY} r="2" fill={`hsl(${hue} 90% 35%)`} />
        {/* Knob body — warm off-white with a subtle border */}
        <circle
          cx={CX} cy={CY} r="7"
          fill="rgba(240,236,230,0.95)"
          stroke="rgba(120,108,96,0.28)"
          strokeWidth="1"
        />
      </svg>
      <span className="leading-none text-center" style={{ fontSize: fs(8), color: "var(--ink-3)" }}>{label}</span>
      <span className="tabular-nums leading-none" style={{ fontSize: fs(9), color: "var(--ink-1)" }}>{format(value)}</span>
    </div>
  );
}
