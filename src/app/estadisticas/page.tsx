"use client";

import { useEffect, useMemo, useState } from "react";
import { Starred, Status } from "@/components/Status";
import { LivesChart } from "@/components/LivesChart";
import { ProgressChart } from "@/components/ProgressChart";
import { historyIn, leagueHistory, regularsOf } from "@/lib/history";
import { useLeague } from "@/lib/useLeague";
import { usePartidas } from "@/lib/partidas";
import { allSplashes, dayOf, inRange, leagueRecords, playerStats, records, resumir, type PlayerStats, type Range, type Resumen } from "@/lib/stats";

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
    () => resumir(juego.partidas, juego.jugadores, juego.movimientos, now, new Set(regularsOf(league.players).map((p) => p.id))),
    [juego.partidas, juego.jugadores, juego.movimientos, now, league.players],
  );
  const history = useMemo(
    () => leagueHistory(league.players, league.dias, league.jornadas, league.results, league.adjustments),
    [league.players, league.dias, league.jornadas, league.results, league.adjustments],
  );
  const [focus, setFocus] = useState<string | null>(null);
  const live = todas.findLast((r) => r.live) ?? null;
  const enRango = todas.filter((r) => inRange(dayOf(r.partida.started_at), range));
  const terminadas = enRango.filter((r) => !r.live);

  const stats = playerStats({
    players: league.players,
    jornadas: league.jornadas,
    results: league.results,
    events: league.events,
    resumenes: terminadas,
    live: enRango.filter((r) => r.live),
    range,
  });
  const periodo = historyIn(history, (d) => inRange(d, range));
  const recs = [...leagueRecords(periodo), ...records(stats, terminadas)];
  const filtrando = Boolean(range.from || range.to);
  const sinFecha = league.jornadas.filter((j) => !j.played_on).length;
  const pairs = allSplashes(enRango, league.events, stats, range, league.jornadas);
  const jornadasEnRango = league.jornadas.filter((j) => inRange(j.played_on, range)).length;
  const sum = (pick: (s: PlayerStats) => number) => stats.reduce((t, s) => t + pick(s), 0);

  const shown = enRango.find((r) => r.partida.id === selected) ?? live ?? enRango.at(-1) ?? null;

  if (league.loading || league.error) return <Status loading={league.loading} error={league.error} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">📊 Estadísticas</h1>
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

      {filtrando && sinFecha > 0 && (
        <p className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm">
          📅 Hay <b>{sinFecha} jornadas sin fecha</b> que no entran al filtrar por fechas. Ponle la fecha a cada día en la pestaña{" "}
          <a href="/jornadas" className="font-semibold text-gold underline">Jornadas</a> y saldrán aquí.
        </p>
      )}

      {/* Resumen */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile icon="⚔️" label="Partidas" value={terminadas.length} />
        <Tile icon="🎲" label="Jornadas" value={jornadasEnRango} />
        <Tile icon="🏊" label="Piscinas" value={sum((s) => s.pisDadas)} />
        <Tile icon="📜" label="Historia" value={sum((s) => s.historia)} />
      </section>

      <Card title="📈 Progreso de la liga">
        <ProgressChart history={periodo} focus={focus} onFocus={setFocus} />
        <p className="mt-2 text-xs text-muted">Toca o pasa el ratón por la gráfica para ver cada jornada · D = inicio de cada día · toca un nombre para resaltarlo</p>
      </Card>

      <Individual
        history={periodo}
        stats={stats}
        standings={league.standings.map((s) => ({ key: s.player.id, points: s.points }))}
        focus={focus ?? league.standings[0]?.player.id ?? null}
        onFocus={setFocus}
      />

      {/* Récords */}
      {recs.length > 0 && (
        <Card title="🏅 Récords">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recs.map((r) => (
              <li key={r.title} className="flex items-center gap-3 rounded-xl bg-felt p-3">
                <span className="text-2xl">{r.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted">{r.title}</p>
                  <p className="font-bold leading-tight">{r.who}</p>
                  <p className="text-xs text-muted">{r.value}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {juego.error && (
        <p className="rounded-lg border border-red/50 bg-red/10 p-3 text-sm text-red">
          No se pueden leer las partidas del modo juego ({juego.error}). ¿Se ha ejecutado <code>supabase/03_juego.sql</code>?
        </p>
      )}

      {/* En directo */}
      {live && (
        <section className="space-y-3 rounded-2xl border border-red/50 bg-card p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red" /> En directo
            <span className="text-xs font-normal text-muted">desde las {hora(live.startAt)}</span>
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {live.seats.map((s) => (
              <div key={s.id} className="rounded-xl p-3 text-white [text-shadow:0_1px_3px_rgba(0,0,0,.4)]" style={{ background: s.lives < 0 ? "#1b1b1b" : s.color }}>
                <p className="text-sm font-semibold leading-tight"><Starred name={s.name} /></p>
                {s.lives < 0 ? (
                  <p className="text-2xl font-extrabold text-[#ff4040]">💀 BUST!</p>
                ) : (
                  <p className="tabular text-3xl font-bold">
                    {s.lives}
                    {s.lives === 0 && <span className="ml-2 align-middle text-xs font-semibold">VIDA CERO</span>}
                  </p>
                )}
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
                <span className="tabular w-10 text-right text-sm font-bold">{s.streak > 0 ? `🔥${s.streak}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">🏆 ganó · número = puesto · 💀 primero en caer · 🔥 victorias seguidas ahora mismo</p>
      </Card>

      {/* Barras */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Bars title="⭐ Puntos en partidas" stats={stats} pick={(s) => s.juegoPts} />
        <Bars title="🏆 Partidas ganadas" stats={stats} pick={(s) => s.wins} />
        <Bars title="🪦 Primero en caer" stats={stats} pick={(s) => s.firstOut} />
        <Bars title="🏊 Piscinas entregadas" stats={stats} pick={(s) => s.pisDadas} />
        <Bars title="💧 Piscinas recibidas" stats={stats} pick={(s) => s.pisRecibidas} />
        <Bars title="📜 Puntos de historia" stats={stats} pick={(s) => s.historia} />
        <Bars title="🤦 Autopiscinas" stats={stats} pick={(s) => s.autopiscinas} />
        <Bars title="🩸 Vidas perdidas" stats={stats} pick={(s) => s.lost} />
        <Bars title="🏊 Piscinas lanzadas (partidas)" stats={stats} pick={(s) => s.thrown} />
        <Bars title="💧 Piscinas recibidas (partidas)" stats={stats} pick={(s) => s.received} />
      </div>

      <Balance stats={stats} />

      {pairs.length > 0 && (
        <Card title="🏊 Quién le lanza piscinas a quién">
          <ul className="space-y-1.5">
            {pairs.slice(0, 12).map((p) => (
              <li key={`${p.from.key}>${p.to.key}`} className="flex items-center gap-2 rounded-lg bg-felt px-3 py-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.from.color }} />
                <span className="flex-1 leading-tight"><Starred name={p.from.name} /></span>
                <span className="text-muted">→</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.to.color }} />
                <span className="flex-1 leading-tight"><Starred name={p.to.name} /></span>
                <span className="tabular w-8 text-right font-bold">{p.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}


      {/* Tablas completas */}
      <Card title="⚔️ Modo juego">
        <Table
          stats={stats.filter((s) => s.partidas > 0).sort((a, b) => b.juegoPts - a.juegoPts || b.wins - a.wins)}
          cols={[
            ["PJ", (s) => s.partidas],
            ["Pts", (s) => s.juegoPts],
            ["🏆", (s) => s.wins],
            ["% vict.", (s) => `${Math.round((s.wins / s.partidas) * 100)}%`],
            ["Puesto medio", (s) => fmt(s.avgPlace)],
            ["💀 1º caer", (s) => s.firstOut],
            ["🔥 Racha", (s) => s.streak],
            ["Mejor racha", (s) => s.bestStreak],
            ["🩸 Perdidas", (s) => s.lost],
            ["🏊 Lanzadas", (s) => s.thrown],
            ["💧 Recibidas", (s) => s.received],
            ["0️⃣ Victorias en vida cero", (s) => s.zeroWins],
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
          stats={stats.filter((s) => s.pisDadas + s.pisRecibidas + s.autopiscinas + s.historia > 0).sort((a, b) => b.pisBalance - a.pisBalance)}
          cols={[
            ["🏊 Entregadas", (s) => s.pisDadas],
            ["💧 Recibidas", (s) => s.pisRecibidas],
            ["± Balance", (s) => (s.pisBalance > 0 ? `+${s.pisBalance}` : s.pisBalance)],
            ["🤦 Autopiscinas", (s) => s.autopiscinas],
            ["📜 Historia", (s) => s.historia],
          ]}
        />
        <p className="mt-3 text-xs text-muted">Piscinas de las jornadas de liga + las del modo juego. Balance = entregadas − recibidas.</p>
      </Card>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <p className="text-xs text-muted">{icon} {label}</p>
      <p className="tabular text-3xl font-bold">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 font-bold">{title}</h2>
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
      <span className="leading-tight [overflow-wrap:anywhere]"><Starred name={s.name} /></span>
    </span>
  );
}

function Eliminaciones({ r }: { r: Resumen }) {
  const n = r.seats.length;
  return (
    <ol className="space-y-1 text-sm">
      {r.seats.map((s) => (
        <li key={s.id} className="flex items-center gap-2 rounded-lg bg-felt px-3 py-1.5">
          <span className="tabular w-6 font-bold text-muted">{s.place}º</span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          <span className="flex-1 leading-tight"><Starred name={s.name} /></span>
          <span className="tabular shrink-0 text-right text-xs text-muted">
            {s.outAt
              ? `💀 BUST min ${Math.floor((s.outAt - r.startAt) / 60_000)}${s.place === n ? " · 1º en caer" : ""}`
              : `${s.lives === 0 ? "vida cero" : `${s.lives} ❤️`}${r.winner?.id === s.id ? " · 🏆" : ""}`}
            {s.thrown + s.received > 0 && <span className="block">🏊 {s.thrown} · 💧 {s.received}</span>}
            {!r.live && s.points !== null && <span className="block font-semibold text-gold">{s.points} pts</span>}
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
            <li key={s.key} title={`${s.name}: ${pick(s)}`} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2">
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
              <td className="sticky left-0 min-w-32 bg-card py-2 pr-3"><Name s={s} /></td>
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

// Balance de piscinas: verde si das más de las que recibes, rojo si al revés
function Balance({ stats }: { stats: PlayerStats[] }) {
  const rows = stats.filter((s) => s.pisDadas + s.pisRecibidas > 0).sort((a, b) => b.pisBalance - a.pisBalance);
  const max = Math.max(1, ...rows.map((s) => Math.abs(s.pisBalance)));
  return (
    <Card title="⚖️ Balance de piscinas (entregadas − recibidas)">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nada todavía</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((s) => (
            <li key={s.key} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2">
              <div className="min-w-0">
                <Name s={s} />
                <p className="text-xs text-muted">🏊 {s.pisDadas} · 💧 {s.pisRecibidas}</p>
              </div>
              <div className="relative h-3">
                <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <div
                  className="absolute inset-y-0 rounded"
                  style={{
                    width: `${(Math.abs(s.pisBalance) / max) * 50}%`,
                    [s.pisBalance >= 0 ? "left" : "right"]: "50%",
                    background: s.pisBalance >= 0 ? "#4caf7d" : "var(--red)",
                  }}
                />
              </div>
              <span className={`tabular text-right text-sm font-bold ${s.pisBalance > 0 ? "text-[#4caf7d]" : s.pisBalance < 0 ? "text-red" : ""}`}>
                {s.pisBalance > 0 ? `+${s.pisBalance}` : s.pisBalance}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Ficha de cada jugador: liderato (histórico completo) + sus números en las fechas elegidas
function Individual({ history, stats, standings, focus, onFocus }: {
  history: ReturnType<typeof leagueHistory>;
  stats: PlayerStats[];
  standings: { key: string; points: number }[];
  focus: string | null;
  onFocus: (key: string) => void;
}) {
  const who = history.series.find((s) => s.key === focus) ?? history.series[0];
  if (!who) return null;
  const lead = history.leadership.get(who.key)!;
  const st = stats.find((s) => s.key === who.key);
  const pos = standings.findIndex((s) => s.key === who.key);
  const pts = standings[pos]?.points ?? 0;
  const ahead = standings[pos - 1];
  const totalJ = history.jornadas;
  const totalD = history.dias;

  const groups: { title: string; items: [string, string | number][] }[] = [
    {
      title: "👑 Liderato",
      items: [
        ["Jornadas como líder", `${lead.jornadasLider} de ${totalJ}`],
        ["Días como líder", `${lead.diasLider} de ${totalD}`],
        ["Mejor racha de líder", `${lead.mejorRacha} jornadas`],
        ["Líder ahora", lead.liderDesde ? `desde J${lead.liderDesde}` : "no"],
        ["Mejor puesto", lead.mejorPuesto ? `${lead.mejorPuesto}º` : "–"],
        ["Peor puesto", lead.peorPuesto ? `${lead.peorPuesto}º` : "–"],
        ["Mayor ventaja de líder", lead.maxVentaja ? `+${lead.maxVentaja.pts} (J${lead.maxVentaja.jornada})` : "–"],
        ["Jornadas último 🏮", `${lead.jornadasUltimo} de ${totalJ}`],
        ["Días último 🏮", `${lead.diasUltimo} de ${totalD}`],
      ],
    },
    {
      title: "🎲 Liga",
      items: [
        ["Jornadas", st?.jornadas ?? 0],
        ["Victorias", st?.jornadaWins ?? 0],
        ["Podios", st?.podios ?? 0],
        ["Puesto medio", fmt(st?.avgPos ?? null)],
        ["Racha de victorias", st?.jornadaStreak ?? 0],
        ["Mejor racha", st?.bestJornadaStreak ?? 0],
      ],
    },
    {
      title: "🏊 Piscinas",
      items: [
        ["Entregadas", st?.pisDadas ?? 0],
        ["Recibidas", st?.pisRecibidas ?? 0],
        ["Balance", st ? (st.pisBalance > 0 ? `+${st.pisBalance}` : st.pisBalance) : 0],
        ["Autopiscinas", st?.autopiscinas ?? 0],
        ["Puntos de historia", st?.historia ?? 0],
      ],
    },
    {
      title: "⚔️ Modo juego",
      items: [
        ["Partidas", st?.partidas ?? 0],
        ["Victorias", st?.wins ?? 0],
        ["Puntos", st?.juegoPts ?? 0],
        ["Primero en caer", st?.firstOut ?? 0],
      ],
    },
  ];

  return (
    <Card title="👤 Jugador a jugador">
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {history.series.map((s) => (
          <button
            key={s.key}
            onClick={() => onFocus(s.key)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
              s.key === who.key ? "bg-felt font-semibold text-ink ring-2 ring-gold" : "border border-line text-muted"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <Starred name={s.name} />
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2 rounded-2xl p-4" style={{ background: `color-mix(in srgb, ${who.color} 22%, var(--felt))` }}>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-tight"><Starred name={who.name} /></p>
          <p className="text-sm text-muted">
            {pos === 0 ? "👑 Líder de la liga" : ahead ? `${pos + 1}º · a ${ahead.points - pts} del ${pos}º` : `${pos + 1}º`}
            {who.campeon && " · 🌍 Campeón del mundo vigente"}
            {who.mundiales > 0 && ` · ${who.mundiales} ${who.mundiales === 1 ? "mundial" : "mundiales"}`}
          </p>
        </div>
        <p className="text-right">
          <span className="tabular text-4xl font-bold">{pts}</span>
          <span className="block text-xs text-muted">puntos</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <div key={g.title} className="rounded-xl bg-felt p-3">
            <p className="mb-2 text-sm font-semibold">{g.title}</p>
            <dl className="space-y-1 text-sm">
              {g.items.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="tabular font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Todo sigue el filtro de fechas. El liderato se mide con la clasificación acumulada de toda la liga en cada jornada del periodo.</p>
    </Card>
  );
}
