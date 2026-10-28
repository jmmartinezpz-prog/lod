"use client";

import { useEffect, useRef, useState } from "react";
import { livesAt, type Resumen } from "@/lib/stats";

const H = 260;
const M = { t: 14, r: 92, b: 26, l: 30 };
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const short = (name: string) => (name.length > 11 ? `${name.slice(0, 10)}…` : name);

// Vidas de cada jugador a lo largo de la partida (escalones), con el momento en que cae cada uno.
export function LivesChart({ r }: { r: Resumen }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const start = r.partida.start_lives;
  const t0 = r.startAt;
  const t1 = Math.max(r.endAt, t0 + 60_000);
  const yMax = Math.max(start, ...r.moves.map((m) => m.lives_after));
  const plotW = Math.max(10, width - M.l - M.r);
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => M.t + (1 - v / yMax) * (H - M.t - M.b);

  const totalMin = (t1 - t0) / 60_000;
  const step = STEPS.find((s) => totalMin / s <= 5) ?? 240;
  const xTicks = Array.from({ length: Math.floor(totalMin / step) + 1 }, (_, i) => i * step);
  const yTicks = [...new Set([0, Math.round(yMax / 2), yMax])];

  const path = (s: Resumen["seats"][number]) => {
    let d = `M${x(t0)},${y(start)}`;
    for (const m of s.moves) d += `H${x(Date.parse(m.created_at))}V${y(m.lives_after)}`;
    return s.outAt ? d : d + `H${x(t1)}`;
  };

  // Etiquetas al final de cada línea viva, separadas para que no se pisen
  const labels = r.seats
    .filter((s) => !s.outAt)
    .map((s) => ({ s, y: y(s.lives) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(t0 + frac * (t1 - t0));
  }

  const tip =
    hover === null
      ? null
      : r.seats
          .map((s) => ({ s, v: s.outAt && s.outAt <= hover ? 0 : livesAt(s, start, hover) }))
          .sort((a, b) => b.v - a.v);

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {r.seats.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={H} className="block touch-none">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={M.l + plotW} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
                <text x={M.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                  {v}
                </text>
              </g>
            ))}
            {xTicks.map((m) => (
              <text key={m} x={x(t0 + m * 60_000)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)" className="tabular">
                {m}′
              </text>
            ))}

            {r.seats.map((s) => (
              <g key={s.id}>
                <path d={path(s)} fill="none" stroke="var(--card)" strokeWidth={5} strokeLinejoin="round" />
                <path d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {s.outAt && (
                  <text x={x(s.outAt)} y={y(0) - 8} textAnchor="middle" fontSize={13}>
                    💀
                  </text>
                )}
              </g>
            ))}

            {labels.map(({ s, y: ly }) => (
              <g key={s.id}>
                <circle cx={x(t1)} cy={y(s.lives)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                <text x={x(t1) + 8} y={ly} dy="0.32em" fontSize={11} fill="var(--ink)">
                  {short(s.name)} <tspan fill="var(--muted)" className="tabular">{s.lives}</tspan>
                </text>
              </g>
            ))}

            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
            )}
            <rect
              x={M.l}
              y={0}
              width={plotW}
              height={H}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {tip && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-felt/95 p-2 text-xs shadow-lg"
            style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
          >
            <p className="mb-1 text-muted">Minuto {Math.floor((hover - t0) / 60_000)}</p>
            {tip.map(({ s, v }) => (
              <p key={s.id} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="tabular font-bold">{v === 0 ? "💀" : v}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
