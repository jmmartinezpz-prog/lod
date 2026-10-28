"use client";

import { useEffect, useMemo, useState } from "react";
import { Status } from "@/components/Status";
import { LivesChart } from "@/components/LivesChart";
import { useLeague } from "@/lib/useLeague";
import { usePartidas } from "@/lib/partidas";
import { dayOf, inRange, playerStats, records, resumir, type PlayerStats, type Range, type Resumen } from "@/lib/stats";

type Preset = "todo" | "hoy" | "7" | "30" | "mes" | "fechas";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "hoy", label: "Hoy" },
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
  { id: "mes", label: "Este mes" },
  { id: "fechas", label: "Fechas…" },
];

function presetRange(p: Preset, custom: Range, now: number): Range {
  const ago = (d: number) => dayOf(new Date(now - d * 86_400_000).toISOString());
  switch (p) {
    case "todo": return { from: null, to: null };
    case "hoy": return { from: ago(0), to: null };
    case "7": return { from: ago(6), to: null };
    case "30": return { from: ago(29), to: null };
    case "mes": return { from: `${ago(0).slice(0, 8)}01`, to: null };
    case "fechas": return custom;
  }
}

// Reloj para que la partida en directo avance aunque no lleguen cambios
function useNow(ms: number) {
  const [now, setNow] = useState(0); // Date.now() no se puede evaluar al prerenderizar
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const fmt = (n: number | null, d = 1) => (n === null ? "–" : n.toFixed(d).replace(/\.0$/, ""));
const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

export default function Estadisticas() {
  const league = useLeague();
  const juego = usePartidas();
  const now = useNow(30_000);
  const [preset, setPreset] = useState<Preset>("todo");
  const [custom, setCustom] = useState<Range>({ from: null, to: null });
  const [selected, setSelected] = useState<string | null>(null);
  const range = presetRange(preset, custom, now);

  const todas = useMemo(
    () => resumir(juego.partidas, juego.jugadores, juego.movimientos, now),
    [juego.partidas, juego.jugadores, juego.movimientos, now],
  );
  const live = todas.findLast((r) => r.live) ?? null;
  const enRango = todas.filter((r) => inRange(dayOf(r.partida.started_at), range));
  const terminadas = enRango.filter((r) => !r.live);

  const stats = playerStats({
    players: league.players,
    jornadas: league.jornadas,
    results: league.results,
    events: league.events,
    resumenes: terminadas,
    range,
  });
  const recs = records(stats, terminadas);
  const jornadasEnRango = league.jornadas.filter((j) => inRange(j.played_on, range)).length;
  const sum = (pick: (s: PlayerStats) => number) => stats.reduce((t, s) => t + pick(s), 0);

  const shown = enRango.find((r) => r.partida.id === selected) ?? live ?? enRango.at(-1) ?? null;

  if (league.loading || league.error) return <Status loading={league.loading} error={league.error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">📊 Estadísticas</h1>
        <p className="text-sm text-muted">Se actualizan solas en tiempo real</p>
      </div>

      {/* Filtro de fechas */}
      <section className="space-y-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                preset === p.id ? "bg-gold text-felt" : "border border-line text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "fechas" && (
          <div className="grid grid-cols-2 gap-2 text-xs text-muted">
            <label className="space-y-1">
              Desde
              <input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || null }))} />
            </label>
            <label className="space-y-1">
              Hasta
              <input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || null }))} />
            </label>
          </div>
        )}
      </section>

      {/* Resumen */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile icon="⚔️" label="Partidas" value={terminadas.length} />
        <Tile icon="🎲" label="Jornadas" value={jornadasEnRango} />
        <Tile icon="🏊" label="Piscinas" value={sum((s) => s.piscinas)} />
        <Tile icon="📜" label="Historia" value={sum((s) => s.historia)} />
      </section>

      {juego.error && (
        <p className="rounded-lg border border-red/50 bg-red/10 p-3 text-sm text-red">
          No se pueden leer las partidas del modo juego ({juego.error}). ¿Se ha ejecutado <code>supabase/03_juego.sql</code>?
        </p>
      )}

      {/* En directo */}
      {live && (
        <section className="space-y-3 rounded-2xl border border-red/50 bg-card p-4">
          <h2 className="flex items-center gap-2 font-black">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red" /> En directo
            <span className="text-xs font-normal text-muted">desde las {hora(live.startAt)}</span>
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {live.seats.map((s) => (
              <div key={s.id} className={`rounded-xl p-3 text-white ${s.lives === 0 ? "opacity-40 grayscale" : ""}`} style={{ background: s.color }}>
                <p className="truncate text-xs font-bold uppercase [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">{s.name}</p>
                <p className="tabular text-3xl font-black [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">{s.lives === 0 ? "💀" : s.lives}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Partida a partida */}
      <Card title="📈 Vidas durante la partida">
        {!shown ? (
          <Empty />
        ) : (
          <div className="space-y-4">
            <select value={shown.partida.id} onChange={(e) => setSelected(e.target.value)}>
              {enRango.toReversed().map((r) => (
                <option key={r.partida.id} value={r.partida.id}>
                  {r.live ? "🔴 En directo · " : ""}
                  {fecha(r.partida.started_at)} {hora(r.startAt)}
                  {r.winner ? ` · 🏆 ${r.winner.name}` : ""}
                </option>
              ))}
            </select>
            <LivesChart r={shown} />
            <Eliminaciones r={shown} />
          </div>
        )}
      </Card>

      {/* Racha y forma */}
      <Card title="🔥 Racha y forma (últimas 10 partidas)">
        {terminadas.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2.5">
            {stats.filter((s) => s.partidas > 0).sort((a, b) => b.streak - a.streak || b.wins - a.wins).map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <Name s={s} className="w-32 shrink-0" />
                <div className="flex flex-1 flex-wrap gap-1">
                  {s.form.map((f) => (
                    <span
                      key={f.partidaId}
                      title={`${f.place}º de ${f.of}`}
                      className={`tabular flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${
                        f.place === 1 ? "bg-gold text-felt" : f.place === f.of ? "bg-red/25 text-red" : "bg-felt text-muted"
                      }`}
                    >
                      {f.place === 1 ? "🏆" : f.place === f.of ? "💀" : f.place}
                    </span>
                  ))}
                </div>
                <span className="tabular w-10 text-right text-sm font-black">{s.streak > 0 ? `🔥${s.streak}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">🏆 ganó · número = puesto · 💀 primero en caer · 🔥 victorias seguidas ahora mismo</p>
      </Card>

      {/* Barras */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Bars title="🏆 Partidas ganadas" stats={stats} pick={(s) => s.wins} />
        <Bars title="🪦 Primero en caer" stats={stats} pick={(s) => s.firstOut} />
        <Bars title="🏊 Piscinas" stats={stats} pick={(s) => s.piscinas} />
        <Bars title="📜 Puntos de historia" stats={stats} pick={(s) => s.historia} />
        <Bars title="🤦 Autopiscinas" stats={stats} pick={(s) => s.autopiscinas} />
        <Bars title="🩸 Vidas perdidas" stats={stats} pick={(s) => s.lost} />
      </div>

      {/* Récords */}
      {recs.length > 0 && (
        <Card title="🏅 Récords">
          <ul className="grid gap-2 sm:grid-cols-2">
            {recs.map((r) => (
              <li key={r.title} className="flex items-center gap-3 rounded-xl bg-felt p-3">
                <span className="text-2xl">{r.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted">{r.title}</p>
                  <p className="truncate font-bold">{r.who}</p>
                  <p className="text-xs text-muted">{r.value}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Tablas completas */}
      <Card title="⚔️ Modo juego">
        <Table
          stats={stats.filter((s) => s.partidas > 0).sort((a, b) => b.wins - a.wins || (a.avgPlace ?? 9) - (b.avgPlace ?? 9))}
          cols={[
            ["PJ", (s) => s.partidas],
            ["🏆", (s) => s.wins],
            ["% vict.", (s) => `${Math.round((s.wins / s.partidas) * 100)}%`],
            ["Puesto medio", (s) => fmt(s.avgPlace)],
            ["💀 1º caer", (s) => s.firstOut],
            ["🔥 Racha", (s) => s.streak],
            ["Mejor racha", (s) => s.bestStreak],
            ["🩸 Perdidas", (s) => s.lost],
            ["💚 Recuperadas", (s) => s.gained],
          ]}
        />
      </Card>

      <Card title="🎲 Liga (jornadas registradas)">
        <Table
          stats={stats.filter((s) => s.jornadas > 0).sort((a, b) => b.ligaPts - a.ligaPts)}
          cols={[
            ["J", (s) => s.jornadas],
            ["Pts", (s) => s.ligaPts],
            ["🏆", (s) => s.jornadaWins],
            ["Podios", (s) => s.podios],
            ["Puesto medio", (s) => fmt(s.avgPos)],
            ["🔥 Racha", (s) => s.jornadaStreak],
            ["Mejor racha", (s) => s.bestJornadaStreak],
          ]}
        />
      </Card>

      <Card title="🏊 Palmarés">
        <Table
          stats={stats.filter((s) => s.piscinas + s.autopiscinas + s.historia > 0).sort((a, b) => b.piscinas - a.piscinas)}
          cols={[
            ["🏊 Piscinas", (s) => s.piscinas],
            ["🤦 Autopiscinas", (s) => s.autopiscinas],
            ["📜 Historia", (s) => s.historia],
          ]}
        />
      </Card>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <p className="text-xs text-muted">{icon} {label}</p>
      <p className="tabular text-3xl font-black">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 font-black">{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="py-4 text-center text-sm text-muted">Aún no hay partidas del modo juego en estas fechas.</p>;
}

function Name({ s, className = "" }: { s: PlayerStats; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-sm ${className}`}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
      <span className="truncate">{s.name}</span>
    </span>
  );
}

function Eliminaciones({ r }: { r: Resumen }) {
  const n = r.seats.length;
  return (
    <ol className="space-y-1 text-sm">
      {r.seats.map((s) => (
        <li key={s.id} className="flex items-center gap-2 rounded-lg bg-felt px-3 py-1.5">
          <span className="tabular w-6 font-black text-muted">{s.place}º</span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          <span className="flex-1 truncate">{s.name}</span>
          <span className="tabular text-xs text-muted">
            {s.outAt
              ? `💀 min ${Math.floor((s.outAt - r.startAt) / 60_000)}${s.place === n ? " · primero en caer" : ""}`
              : `${s.lives} ❤️${r.winner?.id === s.id ? " · 🏆" : ""}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Bars({ title, stats, pick }: { title: string; stats: PlayerStats[]; pick: (s: PlayerStats) => number }) {
  const rows = stats.filter((s) => pick(s) > 0).sort((a, b) => pick(b) - pick(a));
  const max = Math.max(1, ...rows.map(pick));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nada todavía</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.key} title={`${s.name}: ${pick(s)}`} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2">
              <Name s={s} />
              <div className="h-3">
                <div className="h-full rounded-r" style={{ width: `${(pick(s) / max) * 100}%`, background: s.color }} />
              </div>
              <span className="tabular text-right text-sm font-bold">{pick(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Table({ stats, cols }: { stats: PlayerStats[]; cols: [string, (s: PlayerStats) => string | number][] }) {
  if (stats.length === 0) return <p className="text-sm text-muted">Nada en estas fechas.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="sticky left-0 bg-card py-1.5 pr-3 font-normal">Jugador</th>
            {cols.map(([h]) => (
              <th key={h} className="whitespace-nowrap px-2 py-1.5 text-right font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.key} className="border-t border-line">
              <td className="sticky left-0 bg-card py-2 pr-3"><Name s={s} className="max-w-36" /></td>
              {cols.map(([h, f]) => (
                <td key={h} className="tabular px-2 py-2 text-right font-semibold">{f(s)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
