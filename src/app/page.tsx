"use client";

import { useMemo } from "react";
import { useLeague } from "@/lib/useLeague";
import { Status, PlayerName } from "@/components/Status";
import { leagueHistory } from "@/lib/history";
import { useMovimiento, type Cambio } from "@/lib/useMovimiento";

const pct = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });

export default function Clasificacion() {
  const { standings, league, playedTotal, players, dias, jornadas, results, adjustments, loading, error } = useLeague();
  const total = league?.total_jornadas ?? 200;
  const done = Math.min(100, (playedTotal / total) * 100);
  const leader = standings[0]?.points ?? 0;

  const history = useMemo(
    () => leagueHistory(players, dias, jornadas, results, adjustments),
    [players, dias, jornadas, results, adjustments],
  );
  const color = new Map(history.series.map((s) => [s.key, s.color]));
  const diasJugados = new Set(jornadas.map((j) => j.dia_id).filter(Boolean)).size;
  const mov = useMovimiento(standings.map((s) => ({ id: s.player.id, points: s.points })), !loading && !error);
  const vista = mov.ordenar(standings, (s) => s.player.id);

  return (
    <div className="space-y-6">
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Liga oficial de dados</p>
        <h1 className="text-3xl font-bold lg:text-4xl">{league?.name ?? "Road to Napicol 2027"}</h1>

        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-end justify-between gap-3">
            <p>
              <span className="tabular text-3xl font-bold">J{playedTotal}</span>
              <span className="text-muted"> / {total}</span>
            </p>
            <p className="text-right">
              <span className="tabular text-3xl font-bold text-gold">{pct(done)}%</span>
              <span className="block text-xs text-muted">de liga jugada</span>
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-felt">
            <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${done}%` }} />
          </div>
          <p className="mt-2 flex justify-between text-xs text-muted">
            <span>{diasJugados > 0 && `${diasJugados} días de juego`}</span>
            <span className="tabular">quedan {Math.max(0, total - playedTotal)} jornadas · {pct(100 - done)}%</span>
          </p>
        </div>
      </section>

      <Status loading={loading} error={error} />

      {!loading && !error && (
        <>
          {/* Cabecera de columnas solo en ordenador */}
          <div className="hidden grid-cols-[3rem_minmax(0,1fr)_repeat(6,5.5rem)_6rem] items-center gap-3 px-4 text-xs text-muted lg:grid">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">🏆 Victorias</span>
            <span className="text-right">🥉 Podios</span>
            <span className="text-right">🏊 Entregadas</span>
            <span className="text-right">💧 Recibidas</span>
            <span className="text-right">± Balance</span>
            <span className="text-right">🎲 Jornadas</span>
            <span className="text-right">Puntos</span>
          </div>

          <ol className="space-y-2">
            {vista.map((s, i) => {
              const rival = vista[i - 1];
              const pts = mov.puntos(s.player.id, s.points);
              const cambio = mov.cambio(s.player.id);
              const lead = history.leadership.get(s.player.id);
              const gapLeader = leader - s.points;
              const gapRival = rival ? rival.points - s.points : 0;
              return (
                <li
                  key={s.player.id}
                  ref={mov.ref(s.player.id)}
                  className={`rounded-2xl border p-3 lg:grid lg:grid-cols-[3rem_minmax(0,1fr)_repeat(6,5.5rem)_6rem] lg:items-center lg:gap-3 lg:px-4 ${
                    i === 0 ? "border-gold/60 bg-gold/10" : "border-line bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3 lg:contents">
                    <span className={`tabular flex w-7 flex-col items-center pt-0.5 text-xl font-bold lg:w-auto lg:items-start lg:text-2xl ${i === 0 ? "text-gold" : "text-muted"}`}>
                      {i + 1}
                      <Flecha cambio={cambio} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-lg font-semibold leading-tight">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color.get(s.player.id) }} />
                        <PlayerName nickname={s.player.nickname} emoji={s.player.emoji} mundiales={s.player.mundiales} campeon={s.player.campeon} />
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {i === 0 ? (
                          <span className="text-gold">
                            👑 Líder{lead?.liderDesde ? ` desde J${lead.liderDesde}` : ""}
                            {vista[1] && ` · +${s.points - vista[1].points} sobre el 2º`}
                          </span>
                        ) : (
                          <>
                            <span className="text-ink">{gapRival === 0 ? "empatado" : `a ${gapRival}`}</span> de{" "}
                            {rival.player.nickname}
                            {i > 1 && <> · a {gapLeader} del líder</>}
                          </>
                        )}
                      </p>
                      {/* Estadísticas en móvil */}
                      <p className="mt-2 flex flex-wrap gap-1.5 text-xs lg:hidden">
                        <Chip>🏆 {s.wins}</Chip>
                        <Chip>🥉 {s.podios}</Chip>
                        <Chip>🏊 {s.piscinas}</Chip>
                        <Chip>💧 {s.recibidas}</Chip>
                        <Chip><Balance n={s.balance} /></Chip>
                        <Chip>🎲 {s.played}</Chip>
                      </p>
                    </div>

                    <Puntos pts={pts} cambio={cambio} className="flex lg:hidden" />
                  </div>

                  {[s.wins, s.podios, s.piscinas, s.recibidas].map((v, k) => (
                    <span key={k} className="tabular hidden text-right text-lg lg:block">{v}</span>
                  ))}
                  <span className="tabular hidden text-right text-lg font-semibold lg:block"><Balance n={s.balance} /></span>
                  <span className="tabular hidden text-right text-lg lg:block">{s.played}</span>
                  <Puntos pts={pts} cambio={cambio} className="hidden lg:flex" />
                </li>
              );
            })}
          </ol>

          <p className="text-center text-xs text-muted lg:hidden">
            🏆 victorias · 🥉 podios · 🏊 piscinas entregadas · 💧 recibidas · ± balance (entregadas − recibidas) · 🎲 jornadas jugadas
          </p>
        </>
      )}
    </div>
  );
}

// ▲2 / ▼1: puestos ganados o perdidos desde la última vez que se miró la clasificación en este móvil
function Flecha({ cambio }: { cambio?: Cambio }) {
  if (!cambio?.puestos) return null;
  const sube = cambio.puestos > 0;
  return (
    <span className={`animate-splash text-[11px] font-bold leading-tight ${sube ? "text-[#4caf7d]" : "text-red"}`}>
      {sube ? "▲" : "▼"}{Math.abs(cambio.puestos)}
    </span>
  );
}

function Puntos({ pts, cambio, className = "" }: { pts: number; cambio?: Cambio; className?: string }) {
  return (
    <span className={`flex-col items-end ${className}`}>
      <span className="tabular text-3xl font-bold">{pts}</span>
      {!!cambio?.puntos && (
        <span className={`animate-splash tabular text-xs font-bold ${cambio.puntos > 0 ? "text-[#4caf7d]" : "text-red"}`}>
          {cambio.puntos > 0 ? `+${cambio.puntos}` : cambio.puntos}
        </span>
      )}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="tabular rounded-full bg-felt px-2 py-0.5 text-ink">{children}</span>;
}

function Balance({ n }: { n: number }) {
  return (
    <span className={n > 0 ? "text-[#4caf7d]" : n < 0 ? "text-red" : "text-muted"}>
      {n > 0 ? `+${n}` : n}
    </span>
  );
}
