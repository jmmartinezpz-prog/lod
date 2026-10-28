"use client";

import { useEffect, useMemo, useState } from "react";
import { Starred, Status } from "@/components/Status";
import { LivesChart } from "@/components/LivesChart";
import { ProgressChart } from "@/components/ProgressChart";
import { historyIn, leagueHistory, regularsOf } from "@/lib/history";
import { useLeague } from "@/lib/useLeague";
import { usePermiso } from "@/lib/llave";
import { cancelPartida, usePartidas } from "@/lib/partidas";
import { allSplashes, dayOf, finales, type Final, inRange, leagueRecords, playerStats, records, resumir, type PlayerStats, type Range, type Resumen } from "@/lib/stats";

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

type Tab = "liga" | "jugadores" | "partidas" | "piscinas" | "records";
const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "liga", label: "🏆 Liga", sub: "progreso, puestos, finales" },
  { id: "jugadores", label: "👤 Jugadores", sub: "ficha y racha" },
  { id: "partidas", label: "⚔️ Partidas", sub: "vidas y modo juego" },
  { id: "piscinas", label: "🏊 Piscinas", sub: "palmarés y quién a quién" },
  { id: "records", label: "🏅 Récords", sub: "lo mejor y lo peor" },
];
const TAB_KEY = "lod-stats-tab";

export default function Estadisticas() {
  const league = useLeague();
  const juego = usePartidas();
  const now = useNow(30_000);
  const permiso = usePermiso();
  const [preset, setPreset] = useState<Preset>("todo");
  const [custom, setCustom] = useState<Range>({ from: null, to: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("liga");
  useEffect(() => {
    try {
      const t = localStorage.getItem(TAB_KEY) as Tab | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (t && TABS.some((x) => x.id === t)) setTab(t);
    } catch {}
  }, []);
  function elegirTab(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  }
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
  // Sanciones del periodo (con su jornada), para la ficha y los récords
  const jornadaById = new Map(league.jornadas.map((j) => [j.id, j]));
  const sanciones = league.adjustments
    .filter((a) => a.kind === "sancion")
    .map((a) => ({ ...a, jornada: a.jornada_id ? jornadaById.get(a.jornada_id) : undefined }))
    .filter((a) => inRange(a.jornada ? a.jornada.played_on : dayOf(a.created_at), range))
    .sort((a, b) => (a.jornada?.number ?? 0) - (b.jornada?.number ?? 0));
  const recs = [...leagueRecords(periodo), ...sancionRecords(sanciones, periodo.series), ...records(stats, terminadas)];
  const filtrando = Boolean(range.from || range.to);
  const sinFecha = league.jornadas.filter((j) => !j.played_on).length;
  const fin = finales(stats, league.jornadas, league.results, range);
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

      {/* Secciones: todas las estadísticas, agrupadas para no perderse */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => elegirTab(t.id)}
            className={`flex shrink-0 flex-col items-start rounded-2xl px-3.5 py-2 text-left ${
              tab === t.id ? "bg-gold text-felt" : "border border-line text-muted"
            }`}
          >
            <span className="text-sm font-bold">{t.label}</span>
            <span className={`text-[11px] ${tab === t.id ? "text-felt/75" : "text-muted"}`}>{t.sub}</span>
          </button>
        ))}
      </nav>

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

      {tab === "liga" && (
        <>
        <Card title="📈 Progreso de la liga">
          <ProgressChart history={periodo} focus={focus} onFocus={setFocus} />
          <p className="mt-2 text-xs text-muted">Toca o pasa el ratón por la gráfica para ver cada jornada · D = inicio de cada día · toca un nombre para resaltarlo</p>
        </Card>

        <Puestos stats={stats} />
        <CaraACara finales={fin} />
        <Card title="🎲 Liga (jornadas registradas)">
          <Table
            stats={stats.filter((s) => s.jornadas > 0).sort((a, b) => b.ligaPts - a.ligaPts)}
            cols={[
              ["J", (s) => s.jornadas],
              ["Pts", (s) => s.ligaPts],
              ["🏆", (s) => s.jornadaWins],
              ["Podios", (s) => s.podios],
              ...Array.from({ length: Math.max(0, ...stats.map((s) => s.puestos.length)) - 1 }, (_, i): [string, (s: PlayerStats) => number] => [`${i + 2}º`, (s) => s.puestos[i + 1] ?? 0]),
              ["🏮 Último", (s) => s.ultimos],
              ["Puesto medio", (s) => fmt(s.avgPos)],
              ["🔥 Racha", (s) => s.jornadaStreak],
              ["Mejor racha", (s) => s.bestJornadaStreak],
            ]}
          />
        </Card>

        <Penalizaciones
          adjustments={league.adjustments}
          jornadas={league.jornadas}
          dias={league.dias}
          players={league.players}
          stats={stats}
          range={range}
        />
        </>
      )}

      {tab === "jugadores" && (
        <>
        <Individual
          history={periodo}
          stats={stats}
          standings={league.standings.map((s) => ({ key: s.player.id, points: s.points }))}
          focus={focus ?? league.standings[0]?.player.id ?? null}
          onFocus={setFocus}
          sanciones={sanciones}
          finales={fin}
        />

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
        </>
      )}

      {tab === "partidas" && (
        <>
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
              {permiso.puede && <button
                onClick={async () => {
                  if (!confirm("¿Anular esta partida?\n\nDesaparecerá de todas las estadísticas y se borrará su jornada de liga (para pruebas o errores).")) return;
                  const error = await cancelPartida(shown.partida.id);
                  if (error) alert(`No se ha podido anular: ${error}`);
                  else setSelected(null);
                }}
                className="text-xs text-muted underline"
              >
                🗑 Anular esta partida (era una prueba o un error)
              </button>}
            </div>
          )}
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
  <Bars title="⭐ Puntos en partidas" stats={stats} pick={(s) => s.juegoPts} />
  <Bars title="🏆 Partidas ganadas" stats={stats} pick={(s) => s.wins} />
  <Bars title="🪦 Primero en caer" stats={stats} pick={(s) => s.firstOut} />
  <Bars title="🩸 Vidas perdidas" stats={stats} pick={(s) => s.lost} />
  <Bars title="🏊 Piscinas lanzadas (partidas)" stats={stats} pick={(s) => s.thrown} />
  <Bars title="💧 Piscinas recibidas (partidas)" stats={stats} pick={(s) => s.received} />
        </div>
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
        </>
      )}

      {tab === "piscinas" && (
        <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
  <Bars title="🏊 Piscinas entregadas" stats={stats} pick={(s) => s.pisDadas} />
  <Bars title="💧 Piscinas recibidas" stats={stats} pick={(s) => s.pisRecibidas} />
  <Bars title="🤦 Autopiscinas" stats={stats} pick={(s) => s.autopiscinas} />
  <Bars title="📜 Puntos de historia" stats={stats} pick={(s) => s.historia} />
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
        </>
      )}

      {tab === "records" && (
        <>
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
        </>
      )}

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
type Sancion = { player_id: string; points: number; reason: string | null; jornada?: { number: number } };

// Más sancionado y más llegadas tarde (empates: salen todos)
function sancionRecords(sanciones: Sancion[], series: { key: string; name: string }[]) {
  const name = new Map(series.map((s) => [s.key, s.name]));
  const out: { icon: string; title: string; who: string; value: string }[] = [];
  const top = (rows: Sancion[], icon: string, title: string, unit: (n: number, pts: number) => string) => {
    const by = new Map<string, { n: number; pts: number }>();
    for (const r of rows) {
      const cur = by.get(r.player_id) ?? { n: 0, pts: 0 };
      by.set(r.player_id, { n: cur.n + 1, pts: cur.pts + r.points });
    }
    const max = Math.max(0, ...[...by.values()].map((v) => v.n));
    if (!max) return;
    const who = [...by].filter(([, v]) => v.n === max);
    out.push({ icon, title, who: who.map(([k]) => name.get(k) ?? "🃏 Wildcard").join(" y "), value: unit(max, who[0][1].pts) });
  };
  top(sanciones, "⚖️", "Más sancionado", (n, pts) => `${n} ${n === 1 ? "sanción" : "sanciones"} · ${pts} pts`);
  top(sanciones.filter((s) => /tarde/i.test(s.reason ?? "")), "⏰", "Más llegadas tarde", (n) => `${n} ${n === 1 ? "vez" : "veces"}`);
  return out;
}

function Individual({ history, stats, standings, focus, onFocus, sanciones, finales }: {
  history: ReturnType<typeof leagueHistory>;
  stats: PlayerStats[];
  standings: { key: string; points: number }[];
  focus: string | null;
  onFocus: (key: string) => void;
  sanciones: Sancion[];
  finales: Final[];
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
      title: "🥇 Puestos en jornadas",
      items: [
        ...(st?.puestos ?? []).map((n, i): [string, string | number] => [`${i + 1}º`, n]),
        ["🏮 Último", st?.ultimos ?? 0],
      ],
    },
    {
      title: "🤺 Finales (1º contra 2º)",
      items: (() => {
        const mias = finales.filter((f) => f.a.key === who.key || f.b.key === who.key);
        if (!mias.length) return [["Sin finales", "–"]] as [string, string | number][];
        const gan = mias.reduce((t, f) => t + (f.a.key === who.key ? f.aWins : f.bWins), 0);
        const tot = mias.reduce((t, f) => t + f.total, 0);
        return [
          ["Jugadas", tot],
          ["Ganadas · perdidas", `${gan} · ${tot - gan}`],
          ...mias.map((f): [string, string | number] => {
            const yo = f.a.key === who.key;
            return [`vs ${(yo ? f.b : f.a).name}`, `${yo ? f.aWins : f.bWins}–${yo ? f.bWins : f.aWins}`];
          }),
        ];
      })(),
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
      title: "⚖️ Sanciones",
      items: (() => {
        const mine = sanciones.filter((x) => x.player_id === who.key);
        if (!mine.length) return [["Sin sanciones", "😇"]] as [string, string | number][];
        return [
          ["Total", `${mine.length} · ${mine.reduce((t, x) => t + x.points, 0)} pts`],
          ...mine.map((x): [string, string | number] => [`${x.jornada ? `J${x.jornada.number} · ` : ""}${x.reason ?? "Sin motivo"}`, x.points]),
        ];
      })(),
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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

// Cuántas veces ha quedado cada uno en cada puesto de las jornadas (más intenso = más veces)
function Puestos({ stats }: { stats: PlayerStats[] }) {
  const rows = stats.filter((s) => s.jornadas > 0).sort((a, b) => b.ligaPts - a.ligaPts);
  if (!rows.length) return null;
  const n = Math.max(...rows.map((s) => s.puestos.length));
  const max = Math.max(1, ...rows.flatMap((s) => [...s.puestos, s.ultimos]));
  const cell = (v: number) => ({ background: `color-mix(in srgb, var(--gold) ${Math.round((v / max) * 70)}%, var(--felt))` });
  return (
    <Card title="🎯 Puestos en las jornadas">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="text-left font-normal">Jugador</th>
              {Array.from({ length: n }, (_, i) => (
                <th key={i} className="font-normal">{i === 0 ? "🏆 1º" : `${i + 1}º`}</th>
              ))}
              <th className="font-normal">🏮 Último</th>
              <th className="font-normal">J</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.key}>
                <td className="pr-2"><Name s={s} /></td>
                {Array.from({ length: n }, (_, i) => {
                  const v = s.puestos[i] ?? 0;
                  return (
                    <td key={i} title={`${v} de ${s.jornadas} (${Math.round((v / s.jornadas) * 100)}%)`} className="tabular rounded-md py-1.5 text-center font-semibold" style={cell(v)}>
                      {v}
                    </td>
                  );
                })}
                <td className="tabular rounded-md py-1.5 text-center font-semibold" style={cell(s.ultimos)}>{s.ultimos}</td>
                <td className="tabular text-center text-muted">{s.jornadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Último = último de su jornada (con wildcards puede ser el 6º). Pasa el dedo o el ratón por una celda para ver el %.</p>
    </Card>
  );
}

// Finales = jornadas en las que los dos se jugaron la victoria (1º y 2º)
function CaraACara({ finales }: { finales: Final[] }) {
  if (!finales.length) return null;
  return (
    <Card title="🤺 Cara a cara en finales">
      <ul className="grid gap-2 lg:grid-cols-2">
        {finales.map((f) => (
          <li key={`${f.a.key}|${f.b.key}`} className="rounded-xl bg-felt p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`flex-1 leading-tight ${f.aWins > f.bWins ? "font-bold" : "text-muted"}`}><Starred name={f.a.name} /></span>
              <span className="tabular text-lg font-bold">{f.aWins}<span className="mx-1 text-muted">–</span>{f.bWins}</span>
              <span className={`flex-1 text-right leading-tight ${f.bWins > f.aWins ? "font-bold" : "text-muted"}`}><Starred name={f.b.name} /></span>
            </div>
            <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
              {f.aWins > 0 && <span style={{ flex: f.aWins, background: f.a.color }} />}
              {f.bWins > 0 && <span style={{ flex: f.bWins, background: f.b.color }} />}
            </div>
            <p className="mt-1 text-center text-xs text-muted">{f.total} {f.total === 1 ? "final" : "finales"} · la última en la J{f.last}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Penalizaciones: sanciones y multas de puntos de liga
function Penalizaciones({ adjustments, jornadas, dias, players, stats, range }: {
  adjustments: ReturnType<typeof useLeague>["adjustments"];
  jornadas: ReturnType<typeof useLeague>["jornadas"];
  dias: ReturnType<typeof useLeague>["dias"];
  players: ReturnType<typeof useLeague>["players"];
  stats: PlayerStats[];
  range: Range;
}) {
  const jById = new Map(jornadas.map((j) => [j.id, j]));
  const dById = new Map(dias.map((d) => [d.id, d]));
  const pById = new Map(players.map((p) => [p.id, p]));
  const sById = new Map(stats.map((s) => [s.key, s]));

  const list = adjustments
    .filter((a) => a.kind === "sancion")
    .map((a) => {
      const j = a.jornada_id ? jById.get(a.jornada_id) : undefined;
      const d = j?.dia_id ? dById.get(j.dia_id) : undefined;
      const day = j?.played_on || d?.played_on || dayOf(a.created_at);
      return { a, j, d, day };
    })
    .filter((x) => inRange(x.day, range))
    .sort((x, y) => (x.j?.number ?? 9999) - (y.j?.number ?? 9999) || x.a.created_at.localeCompare(y.a.created_at));

  const per = new Map<string, { n: number; pts: number }>();
  for (const { a } of list) {
    const cur = per.get(a.player_id) ?? { n: 0, pts: 0 };
    per.set(a.player_id, { n: cur.n + 1, pts: cur.pts + a.points });
  }
  const resumen = [...per].sort((x, y) => x[1].pts - y[1].pts || y[1].n - x[1].n);
  const totalPts = list.reduce((t, { a }) => t + a.points, 0);
  const label = (id: string) => {
    const s = sById.get(id);
    if (s) return <Name s={s} />;
    const p = pById.get(id);
    return <span>{p ? `${p.emoji ? `${p.emoji} ` : ""}${p.nickname}` : "?"}</span>;
  };

  return (
    <Card title="⚖️ Penalizaciones">
      {list.length === 0 ? (
        <p className="text-sm text-muted">Sin penalizaciones en estas fechas.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-felt p-3">
              <p className="text-xs text-muted">Penalizaciones</p>
              <p className="tabular text-2xl font-bold">{list.length}</p>
            </div>
            <div className="rounded-xl bg-felt p-3">
              <p className="text-xs text-muted">Puntos de penalización</p>
              <p className="tabular text-2xl font-bold text-red">{totalPts}</p>
            </div>
          </div>

          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5 pr-3 font-normal">Jugador</th>
                  <th className="px-2 py-1.5 text-right font-normal">Nº penalizaciones</th>
                  <th className="px-2 py-1.5 text-right font-normal">Puntos de penalización</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map(([id, r]) => (
                  <tr key={id} className="border-t border-line">
                    <td className="min-w-32 py-2 pr-3">{label(id)}</td>
                    <td className="tabular px-2 py-2 text-right font-semibold">{r.n}</td>
                    <td className="tabular px-2 py-2 text-right font-semibold text-red">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Historial</p>
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-normal">Cuándo</th>
                    <th className="px-2 py-1.5 font-normal">Jugador</th>
                    <th className="px-2 py-1.5 text-right font-normal">Puntos</th>
                    <th className="px-2 py-1.5 font-normal">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ a, j, d, day }) => (
                    <tr key={a.id} className="border-t border-line align-top">
                      <td className="whitespace-nowrap py-2 pr-3">
                        <span className="font-semibold">{j ? `J${j.number}` : "—"}</span>
                        <span className="block text-xs text-muted">
                          {d ? `Día ${d.number} · ` : ""}
                          {new Date(day).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{label(a.player_id)}</td>
                      <td className="tabular px-2 py-2 text-right font-bold text-red">{a.points}</td>
                      <td className="px-2 py-2 text-muted">{a.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
