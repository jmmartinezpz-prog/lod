"use client";

import { Starred } from "@/components/Status";
import { useState } from "react";
import { short, useWidth } from "./LivesChart";
import type { LeagueHistory } from "@/lib/history";

type Mode = "puntos" | "lider";
const M = { t: 14, r: 112, b: 28, l: 36 };

// Puntos acumulados jornada a jornada (o distancia al líder), con tooltip y resaltado por jugador.
export function ProgressChart({ history, focus, onFocus }: {
  history: LeagueHistory;
  focus: string | null;
  onFocus: (key: string | null) => void;
}) {
  const [ref, width] = useWidth();
  const [mode, setMode] = useState<Mode>("puntos");
  const [hover, setHover] = useState<number | null>(null);
  const { series, snapshots } = history;
  const H = width >= 900 ? 380 : 300;

  const value = (i: number, key: string) => {
    const t = snapshots[i].totals;
    return mode === "puntos" ? t[key] : t[key] - Math.max(...series.map((s) => t[s.key]));
  };
  const all = snapshots.flatMap((_, i) => series.map((s) => value(i, s.key)));
  const yMin = mode === "puntos" ? 0 : Math.min(...all, -1);
  const yMax = mode === "puntos" ? Math.max(...all, 1) : 0;
  const plotW = Math.max(10, width - M.l - M.r);
  const last = snapshots.length - 1;
  const x = (i: number) => M.l + (last ? i / last : 0) * plotW;
  const y = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - M.t - M.b);

  const yStep = [5, 10, 20, 25, 50, 100].find((s) => (yMax - yMin) / s <= 5) ?? 200;
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v);

  // Una marca en el eje por cada día: donde empieza
  const dayStarts = snapshots
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.diaNumber !== null && snapshots[i - 1]?.diaNumber !== s.diaNumber);

  const labels = series
    .map((s) => ({ s, y: y(value(last, s.key)) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(frac * last));
  }

  const tip =
    hover === null
      ? null
      : series.map((s) => ({ s, v: value(hover, s.key), pts: snapshots[hover].totals[s.key] })).sort((a, b) => b.pts - a.pts);

  if (snapshots.length < 2) return <p className="py-6 text-center text-sm text-muted">Aún no hay jornadas registradas.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["puntos", "lider"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === m ? "bg-gold text-felt" : "border border-line text-muted"}`}
          >
            {m === "puntos" ? "Puntos" : "Distancia al líder"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {series.map((s) => (
          <button
            key={s.key}
            onClick={() => onFocus(focus === s.key ? null : s.key)}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition ${
              focus && focus !== s.key ? "opacity-40" : ""
            } ${focus === s.key ? "bg-felt text-ink" : "text-muted"}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <Starred name={s.name} />
          </button>
        ))}
      </div>

      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={H} className="block touch-none">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={M.l + plotW} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} strokeOpacity={v === 0 ? 1 : 0.6} />
                <text x={M.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">{v}</text>
              </g>
            ))}
            {dayStarts.map(({ s, i }) => (
              <g key={i}>
                <line x1={x(i)} x2={x(i)} y1={M.t} y2={H - M.b} stroke="var(--line)" strokeDasharray="2 4" />
                <text x={x(i)} y={H - 9} textAnchor="middle" fontSize={10} fill="var(--muted)">D{s.diaNumber}</text>
              </g>
            ))}

            {series.map((s) => {
              const dim = focus && focus !== s.key;
              const d = snapshots.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(value(i, s.key)).toFixed(1)}`).join("");
              return (
                <g key={s.key} opacity={dim ? 0.18 : 1}>
                  <path d={d} fill="none" stroke="var(--card)" strokeWidth={5} strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={s.color} strokeWidth={focus === s.key ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}

            {labels.map(({ s, y: ly }) => (
              <g key={s.key} opacity={focus && focus !== s.key ? 0.3 : 1}>
                <circle cx={x(last)} cy={y(value(last, s.key))} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                <text x={x(last) + 8} y={ly} dy="0.32em" fontSize={11} fill="var(--ink)">
                  {short(s.name.replace(/^\p{Extended_Pictographic}\s*/u, ""))}{" "}
                  <tspan fill="var(--muted)" className="tabular">{value(last, s.key)}</tspan>
                </text>
              </g>
            ))}

            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--muted)" strokeDasharray="3 3" />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(value(hover, s.key))} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} opacity={focus && focus !== s.key ? 0.3 : 1} />
                ))}
              </>
            )}
            <rect x={M.l} y={0} width={plotW} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
        )}

        {tip && hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-line bg-felt/95 p-2 text-xs shadow-lg"
            style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
          >
            <p className="mb-1 text-muted">
              {hover === 0 ? "Salida" : `Jornada ${snapshots[hover].number}`}
              {snapshots[hover].diaNumber !== null && ` · Día ${snapshots[hover].diaNumber}`}
            </p>
            {tip.map(({ s, v, pts }, i) => (
              <p key={s.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 leading-tight"><Starred name={s.name} /></span>
                <span className="tabular font-bold">
                  {mode === "puntos" ? pts : v === 0 ? "líder" : v}
                  {mode === "puntos" && i === 0 && hover > 0 ? " 👑" : ""}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
