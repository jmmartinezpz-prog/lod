import type { Movimiento, Partida, PartidaJugador } from "./partidas";
import { coloresDeLiga, pointsFor } from "./partidas";
import type { Jornada, LeagueEvent, Player, Result } from "./types";
import { playerLabel, type LeagueHistory, type Leadership } from "./history";

// Una partida sin movimientos desde hace tanto se da por terminada
const LIVE_WINDOW = 3 * 60 * 60 * 1000;

// Día de juego (yyyy-mm-dd, hora local). Hasta las 6:00 sigue contando como el día anterior,
// porque muchas noches se acaba pasada la medianoche.
export const DAY_CUTOFF_HOURS = 6;
// Desde este día se juega con el marcador de la app: antes no hay vidas apuntadas
export const VIDAS_DESDE = "2026-10-28";
export const dayOf = (iso: string) =>
  new Date(Date.parse(iso) - DAY_CUTOFF_HOURS * 3_600_000).toLocaleDateString("sv-SE");
export const gameToday = () => dayOf(new Date().toISOString());

export type Range = { from: string | null; to: string | null };
// Lo que no tiene fecha (jornadas de días sin fechar) solo entra cuando no se filtra
export const inRange = (day: string | null | undefined, r: Range) =>
  day ? (!r.from || day >= r.from) && (!r.to || day <= r.to) : !r.from && !r.to;

// Fecha de un evento: la de su jornada si tiene (aunque esté sin fechar), si no la de cuando se apuntó
export const eventDay = (e: { jornada_id: string | null; created_at: string }, jornadaDay: Map<string, string | null>) =>
  e.jornada_id ? jornadaDay.get(e.jornada_id) ?? null : dayOf(e.created_at);

export type SeatResumen = PartidaJugador & {
  key: string;
  lives: number;
  minLives: number; // 0 = llegó a vida cero
  lost: number;
  thrown: number; // piscinas lanzadas (a otros)
  received: number; // piscinas recibidas (de otros)
  autos: number; // autopiscinas: se la tiró él mismo
  gained: number;
  outAt: number | null;
  place: number;
  points: number | null; // puntos de liga que le tocarían por el puesto
  moves: Movimiento[];
};

export type Resumen = {
  partida: Partida;
  seats: SeatResumen[]; // ordenados por puesto
  moves: Movimiento[];
  live: boolean;
  startAt: number;
  endAt: number;
  winner: SeatResumen | null;
};

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const out = new Map<string, T[]>();
  for (const x of xs) {
    const list = out.get(key(x));
    if (list) list.push(x);
    else out.set(key(x), [x]);
  }
  return out;
}

// Todo el que no es jugador fijo de la liga cuenta como "Wildcard" en las estadísticas
export const WILDCARD = "wildcard";
export const WILDCARD_NAME = "🃏 Wildcard";
export const keyOf = (j: { player_id: string | null }, regular?: Set<string>) =>
  j.player_id && (!regular || regular.has(j.player_id)) ? j.player_id : WILDCARD;

export function resumir(
  partidas: Partida[],
  jugadores: PartidaJugador[],
  movimientos: Movimiento[],
  now: number,
  regular?: Set<string>,
): Resumen[] {
  const movesBy = groupBy(movimientos, (m) => m.partida_id);
  const seatsBy = groupBy(jugadores, (j) => j.partida_id);

  return partidas
    .filter((p) => !p.cancelada && movesBy.has(p.id) && seatsBy.has(p.id))
    .map((partida) => {
      const moves = movesBy.get(partida.id)!.toSorted((a, b) => a.created_at.localeCompare(b.created_at));
      const last = Date.parse(moves.at(-1)!.created_at);
      const live = !partida.ended_at && now - last < LIVE_WINDOW;
      const startAt = Math.min(Date.parse(partida.started_at), Date.parse(moves[0].created_at));
      const endAt = partida.ended_at ? Math.max(Date.parse(partida.ended_at), last) : live ? now : last;

      const seats = seatsBy.get(partida.id)!.map((j) => {
        const mine = moves.filter((m) => m.jugador_id === j.id);
        const lives = mine.at(-1)?.lives_after ?? partida.start_lives;
        return {
          ...j,
          key: keyOf(j, regular),
          lives,
          minLives: Math.min(partida.start_lives, ...mine.map((m) => Math.max(0, m.lives_after))),
          lost: mine.reduce((s, m) => s + Math.max(0, -m.delta), 0),
          gained: mine.reduce((s, m) => s + Math.max(0, m.delta), 0),
          outAt: lives < 0 ? Date.parse(mine.at(-1)!.created_at) : null,
          thrown: moves.filter((m) => m.kind === "piscina" && m.from_jugador_id === j.id && m.jugador_id !== j.id).length,
          received: mine.filter((m) => m.kind === "piscina" && m.from_jugador_id !== j.id).length,
          autos: mine.filter((m) => m.kind === "piscina" && m.from_jugador_id === j.id).length,
          place: 0,
          points: null as number | null,
          moves: mine,
        };
      });
      // Vivos por vidas; eliminados por quién aguantó más
      seats.sort((a, b) =>
        a.outAt === null && b.outAt === null
          ? b.lives - a.lives || a.seat - b.seat
          : a.outAt === null ? -1 : b.outAt === null ? 1 : b.outAt - a.outAt,
      );
      seats.forEach((s, i) => {
        s.place = i + 1;
        s.points = pointsFor(partida.kind ?? (partida.start_lives === 8 ? "sobrante" : "normal"), seats.length, i + 1);
      });

      return { partida, seats, moves, live, startAt, endAt, winner: !live && seats.length > 1 ? seats[0] : null };
    })
    .sort((a, b) => a.startAt - b.startAt);
}

export const livesAt = (s: SeatResumen, start: number, t: number) =>
  s.moves.findLast((m) => Date.parse(m.created_at) <= t)?.lives_after ?? start;

function streaks(flags: boolean[]) {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    run = f ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

export type FormItem = { place: number; of: number; partidaId: string };

export type PlayerStats = {
  key: string;
  name: string;
  color: string;
  // modo juego
  partidas: number;
  wins: number;
  avgPlace: number | null;
  firstOut: number;
  lost: number;
  gained: number;
  streak: number;
  bestStreak: number;
  form: FormItem[]; // de más antigua a más reciente
  thrown: number;
  received: number;
  partidasConVidas: number; // partidas con marcador (desde VIDAS_DESDE)
  zeroWins: number; // victorias desde la vida cero
  vidasAlGanar: number | null; // media de vidas con las que gana: alto = gana sobrado
  maxVidasGanando: number | null; // su victoria más holgada
  porLaMinima: number; // victorias con 1 vida o en vida cero
  vidasPorPartida: number | null; // media de vidas perdidas
  autosJuego: number; // autopiscinas en partidas
  juegoPts: number;
  // liga
  jornadas: number;
  jornadaWins: number;
  podios: number;
  puestos: number[]; // veces en cada puesto de la jornada: [1º, 2º, 3º, …]
  ultimos: number; // veces último de su jornada
  avgPos: number | null;
  ligaPts: number;
  jornadaStreak: number;
  bestJornadaStreak: number;
  // palmarés
  piscinas: number; // entregadas en la liga (jornadas)
  recibidas: number; // recibidas en la liga (jornadas)
  autopiscinas: number;
  historia: number;
  // piscinas totales (liga + modo juego)
  pisDadas: number;
  pisRecibidas: number;
  pisBalance: number; // dadas - recibidas
};

export function playerStats(opts: {
  players: Player[];
  jornadas: Jornada[];
  results: Result[];
  events: LeagueEvent[];
  resumenes: Resumen[]; // del modo juego, ya filtrados por fecha y terminados: solo para lo de las vidas
  range: Range;
}): PlayerStats[] {
  const { players, jornadas, results, events, resumenes, range } = opts;
  const regulars = players
    .filter((p) => p.active && !p.is_wildcard)
    .sort((a, b) => (a.seat_order ?? 99) - (b.seat_order ?? 99) || a.nickname.localeCompare(b.nickname));
  const label = playerLabel;

  const jornadaById = new Map(jornadas.filter((j) => inRange(j.played_on, range)).map((j) => [j.id, j]));
  const jornadaDay = new Map(jornadas.map((j) => [j.id, j.played_on as string | null]));
  // Último puesto de cada jornada (con invitados del modo juego puede haber huecos: vale el puesto más alto)
  const porJornada = new Map<string, number>();
  for (const r of results) porJornada.set(r.jornada_id, Math.max(porJornada.get(r.jornada_id) ?? 0, r.position));
  const myResults = results
    .filter((r) => jornadaById.has(r.jornada_id))
    .sort((a, b) => jornadaById.get(a.jornada_id)!.number - jornadaById.get(b.jornada_id)!.number);
  const myEvents = events.filter((e) =>
    inRange(eventDay(e, jornadaDay), range),
  );
  // Las vidas solo se cuentan desde que se juega con el marcador de la app
  const conVidas = resumenes.filter((r) => dayOf(r.partida.started_at) >= VIDAS_DESDE);

  const keys = new Map<string, { name: string; color: string }>();
  const colores = coloresDeLiga(players);
  regulars.forEach((p) => keys.set(p.id, { name: label(p), color: colores.get(p.id)! }));
  const group = (id: string | null) => (id && keys.has(id) ? id : WILDCARD);
  const anyWild =
    conVidas.some((r) => r.seats.some((s) => s.key === WILDCARD)) ||
    [...myResults, ...myEvents].some((x) => group(x.player_id) === WILDCARD);
  if (anyWild) keys.set(WILDCARD, { name: WILDCARD_NAME, color: "var(--muted)" });

  return [...keys].map(([key, { name, color }]) => {
    // Cada jornada es una partida: puestos, puntos, victorias y piscinas salen de las jornadas (todas)
    const res = myResults.filter((r) => group(r.player_id) === key);
    const ev = myEvents.filter((e) => group(e.player_id) === key);
    const sum = (kind: LeagueEvent["kind"]) => ev.filter((e) => e.kind === kind).reduce((t, e) => t + e.value, 0);
    const recibidas = myEvents
      .filter((e) => e.kind === "piscina" && e.target_player_id && group(e.target_player_id) === key)
      .reduce((t, e) => t + e.value, 0);
    const ultimos = res.filter((r) => r.position > 1 && r.position === porJornada.get(r.jornada_id)).length;
    // Lo de las vidas, del marcador del modo juego (desde VIDAS_DESDE)
    const seats = conVidas.flatMap((r) => r.seats.filter((s) => s.key === key));
    const ganadas = seats.filter((s) => s.place === 1).map((s) => Math.max(0, s.lives));
    const liga = streaks(res.map((r) => r.position === 1));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    return {
      key, name, color,
      partidas: res.length,
      wins: res.filter((r) => r.position === 1).length,
      avgPlace: avg(res.map((r) => r.position)),
      firstOut: ultimos,
      lost: seats.reduce((t, s) => t + s.lost, 0),
      gained: seats.reduce((t, s) => t + s.gained, 0),
      streak: liga.current,
      bestStreak: liga.best,
      form: res.slice(-10).map((r) => ({ place: r.position, of: porJornada.get(r.jornada_id) ?? r.position, partidaId: r.jornada_id })),
      thrown: sum("piscina"),
      received: recibidas,
      juegoPts: res.reduce((t, r) => t + r.points, 0),
      partidasConVidas: seats.length,
      zeroWins: seats.filter((s) => s.place === 1 && s.minLives === 0).length,
      vidasAlGanar: avg(ganadas),
      maxVidasGanando: ganadas.length ? Math.max(...ganadas) : null,
      porLaMinima: ganadas.filter((v) => v <= 1).length,
      vidasPorPartida: avg(seats.map((s) => s.lost)),
      autosJuego: seats.reduce((t, s) => t + s.autos, 0),
      jornadas: res.length,
      jornadaWins: res.filter((r) => r.position === 1).length,
      podios: res.filter((r) => r.position <= 3).length,
      puestos: res.reduce<number[]>((acc, r) => {
        while (acc.length < r.position) acc.push(0);
        acc[r.position - 1] += 1;
        return acc;
      }, []),
      ultimos,
      avgPos: avg(res.map((r) => r.position)),
      ligaPts: res.reduce((t, r) => t + r.points, 0),
      jornadaStreak: liga.current,
      bestJornadaStreak: liga.best,
      piscinas: sum("piscina"),
      recibidas,
      autopiscinas: sum("autopiscina"),
      historia: sum("historia"),
      pisDadas: sum("piscina"),
      pisRecibidas: recibidas,
      pisBalance: sum("piscina") - recibidas,
    };
  });
}

// Cara a cara en finales: en cada jornada, la final la juegan el 1º y el 2º
export type Final = { a: PlayerStats; b: PlayerStats; aWins: number; bWins: number; total: number; last: number };

export function finales(stats: PlayerStats[], jornadas: Jornada[], results: Result[], range: Range): Final[] {
  const byKey = new Map(stats.map((s) => [s.key, s]));
  const group = (id: string) => (byKey.has(id) ? id : WILDCARD);
  const out = new Map<string, Final>();
  for (const j of jornadas) {
    if (!inRange(j.played_on, range)) continue;
    const rs = results.filter((r) => r.jornada_id === j.id);
    const w = rs.find((r) => r.position === 1);
    const l = rs.find((r) => r.position === 2);
    if (!w || !l) continue;
    const [kw, kl] = [group(w.player_id), group(l.player_id)];
    if (kw === kl || !byKey.has(kw) || !byKey.has(kl)) continue;
    const [ka, kb] = [kw, kl].sort();
    const id = `${ka}|${kb}`;
    const f = out.get(id) ?? { a: byKey.get(ka)!, b: byKey.get(kb)!, aWins: 0, bWins: 0, total: 0, last: 0 };
    if (kw === ka) f.aWins += 1;
    else f.bWins += 1;
    f.total += 1;
    f.last = Math.max(f.last, j.number);
    out.set(id, f);
  }
  return [...out.values()].sort((x, y) => y.total - x.total || y.last - x.last);
}

const plural = (n: number) => `${n} ${n === 1 ? "vida" : "vidas"}`;

export type Record = { icon: string; title: string; who: string; value: string };

// Récords de la clasificación: liderato y farolillo rojo (empates: salen todos)
export function leagueRecords(h: LeagueHistory): Record[] {
  if (!h.jornadas) return [];
  const name = new Map(h.series.map((s) => [s.key, s.name]));
  const all = [...h.leadership.values()];
  const names = (ls: Leadership[]) => ls.map((l) => name.get(l.key)).join(" y ");
  const out: Record[] = [];
  const top = (pick: (l: Leadership) => number, icon: string, title: string, unit: (n: number) => string) => {
    const max = Math.max(...all.map(pick));
    if (max > 0) out.push({ icon, title, who: names(all.filter((l) => pick(l) === max)), value: unit(max) });
  };
  const j = (n: number) => `${n} ${n === 1 ? "jornada" : "jornadas"}`;
  const d = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

  top((l) => l.diasLider, "📅", "Más días como líder", (n) => `${d(n)} de ${h.dias}`);
  top((l) => l.jornadasLider, "👑", "Más jornadas como líder", (n) => `${j(n)} de ${h.jornadas}`);
  top((l) => l.mejorRacha, "⛓️", "Racha más larga de líder", (n) => `${j(n)} seguidas`);
  const ventaja = all.filter((l) => l.maxVentaja).toSorted((a, b) => b.maxVentaja!.pts - a.maxVentaja!.pts)[0];
  if (ventaja) out.push({ icon: "🚀", title: "Mayor ventaja siendo líder", who: name.get(ventaja.key)!, value: `+${ventaja.maxVentaja!.pts} pts en J${ventaja.maxVentaja!.jornada}` });
  top((l) => l.diasUltimo, "🏮", "Farolillo rojo: más días último", (n) => d(n));
  top((l) => l.jornadasUltimo, "🐢", "Más jornadas en último puesto", (n) => j(n));
  const nunca = all.filter((l) => l.jornadasLider === 0 && l.mejorPuesto !== null);
  if (nunca.length) out.push({ icon: "🙈", title: "Nunca ha ido líder", who: names(nunca), value: `mejor puesto: ${nunca.map((l) => `${l.mejorPuesto}º`).join(" / ")}` });
  const nuncaUlt = all.filter((l) => l.jornadasUltimo === 0 && l.mejorPuesto !== null);
  if (nuncaUlt.length) out.push({ icon: "🛡️", title: "Nunca ha ido último", who: names(nuncaUlt), value: "ni una jornada" });
  return out;
}

export function records(stats: PlayerStats[], resumenes: Resumen[]): Record[] {
  const out: Record[] = [];
  const top = (pick: (s: PlayerStats) => number, icon: string, title: string, unit: (n: number) => string) => {
    const best = stats.toSorted((a, b) => pick(b) - pick(a))[0];
    if (best && pick(best) > 0) out.push({ icon, title, who: best.name, value: unit(pick(best)) });
  };
  const fmtMin = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`;

  top((s) => s.bestStreak, "🔥", "Mejor racha de victorias", (n) => (n === 1 ? "1 victoria" : `${n} seguidas`));
  top((s) => s.wins, "🏆", "Más partidas ganadas", (n) => `${n}`);
  top((s) => s.firstOut, "🪦", "Más veces primero en caer", (n) => `${n}`);
  top((s) => s.lost, "🩸", "Más vidas perdidas (desde el 28/10)", (n) => `${n}`);
  top((s) => s.pisDadas, "🏊", "Más piscinas entregadas", (n) => `${n}`);
  top((s) => s.pisRecibidas, "💧", "Más piscinas recibidas", (n) => `${n}`);
  top((s) => s.pisBalance, "📈", "Mejor balance de piscinas", (n) => `+${n}`);
  top((s) => -s.pisBalance, "📉", "Peor balance de piscinas", (n) => `-${n}`);
  top((s) => s.zeroWins, "0️⃣", "Más victorias desde la vida cero (desde el 28/10)", (n) => `${n}`);
  top((s) => s.historia, "📜", "Más puntos de historia", (n) => `${n}`);
  top((s) => s.autopiscinas, "🤦", "Más autopiscinas", (n) => `${n}`);
  top((s) => s.porLaMinima, "😅", "Más victorias por la mínima (desde el 28/10)", (n) => `${n} con 1 vida o en vida cero`);

  const won = resumenes.filter((r) => r.winner);
  // Remontada: el ganador llegó a estar por debajo de con lo que acabó
  const comeback = won
    .filter((r) => r.winner!.minLives < r.winner!.lives)
    .toSorted((a, b) => a.winner!.minLives - b.winner!.minLives)[0];
  if (comeback)
    out.push({ icon: "🧟", title: "Mayor remontada", who: comeback.winner!.name, value: `ganó tras quedarse en ${plural(comeback.winner!.minLives)}` });
  const paliza = won.toSorted((a, b) => b.winner!.lives - a.winner!.lives)[0];
  if (paliza) out.push({ icon: "💪", title: "Victoria más holgada", who: paliza.winner!.name, value: `acabó con ${plural(paliza.winner!.lives)}` });
  const apurada = won.toSorted((a, b) => a.winner!.lives - b.winner!.lives)[0];
  if (apurada && apurada !== paliza)
    out.push({ icon: "😰", title: "Victoria más apurada", who: apurada.winner!.name, value: apurada.winner!.lives <= 0 ? "ganó en vida cero" : `acabó con ${plural(apurada.winner!.lives)}` });
  const done = resumenes.filter((r) => !r.live);
  const long = done.toSorted((a, b) => b.endAt - b.startAt - (a.endAt - a.startAt))[0];
  if (long) out.push({ icon: "⏳", title: "Partida más larga", who: dayOf(long.partida.started_at), value: fmtMin(long.endAt - long.startAt) });
  const short = done.toSorted((a, b) => a.endAt - a.startAt - (b.endAt - b.startAt))[0];
  if (short && short !== long) out.push({ icon: "⚡", title: "Partida más rápida", who: dayOf(short.partida.started_at), value: fmtMin(short.endAt - short.startAt) });
  return out;
}

export type Splash = { from: SeatResumen; to: SeatResumen; n: number };

// Piscinas del modo juego agrupadas por quién a quién (por jugador, no por partida)
export function splashes(resumenes: Resumen[]): Splash[] {
  const out = new Map<string, Splash>();
  for (const r of resumenes) {
    const byId = new Map(r.seats.map((s) => [s.id, s]));
    for (const m of r.moves) {
      if (m.kind !== "piscina" || !m.from_jugador_id) continue;
      const from = byId.get(m.from_jugador_id);
      const to = byId.get(m.jugador_id);
      if (!from || !to || from.id === to.id) continue; // autopiscinas aparte
      const k = `${from.key}>${to.key}`;
      out.set(k, { from, to, n: (out.get(k)?.n ?? 0) + 1 });
    }
  }
  return [...out.values()].sort((a, b) => b.n - a.n);
}

export type Pair = { from: { key: string; name: string; color: string }; to: { key: string; name: string; color: string }; n: number };

// Piscinas de liga (jornadas) + modo juego agrupadas por quién a quién
export function allSplashes(resumenes: Resumen[], events: LeagueEvent[], stats: PlayerStats[], range: Range, jornadas: Jornada[]): Pair[] {
  const who = new Map(stats.map((s) => [s.key, { key: s.key, name: s.name, color: s.color }]));
  const day = new Map(jornadas.map((j) => [j.id, j.played_on]));
  const out = new Map<string, Pair>();
  const add = (a: { key: string; name: string; color: string }, b: { key: string; name: string; color: string }, n: number) => {
    const k = `${a.key}>${b.key}`;
    out.set(k, { from: a, to: b, n: (out.get(k)?.n ?? 0) + n });
  };
  for (const p of splashes(resumenes.filter((r) => !r.partida.en_liga))) add(who.get(p.from.key) ?? p.from, who.get(p.to.key) ?? p.to, p.n);
  for (const e of events) {
    if (e.kind !== "piscina" || !e.target_player_id) continue;
    if (!inRange(eventDay(e, day), range)) continue;
    const a = who.get(e.player_id) ?? who.get(WILDCARD);
    const b = who.get(e.target_player_id) ?? who.get(WILDCARD);
    if (a && b) add(a, b, e.value);
  }
  return [...out.values()].sort((x, y) => y.n - x.n);
}
