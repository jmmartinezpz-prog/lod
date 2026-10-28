import { coloresDeLiga } from "./partidas";
import type { Adjustment, Dia, Jornada, Player, Result } from "./types";

// Foto de la clasificación justo después de cada jornada (índice 0 = antes de empezar)
export type Snapshot = {
  number: number; // nº de jornada (0 = salida)
  diaNumber: number | null;
  day: string | null; // fecha del día (yyyy-mm-dd), null si aún no se ha puesto
  totals: Record<string, number>;
  leaders: string[]; // empatados en cabeza cuentan todos
  lasts: string[]; // farolillo rojo (también con empates)
  ranks: Record<string, number>; // solo de los que ya han empezado a jugar
};

export type Leadership = {
  key: string;
  jornadasLider: number;
  diasLider: number;
  mejorRacha: number; // jornadas seguidas como líder
  liderDesde: number | null; // jornada desde la que es líder (al final del periodo)
  mejorPuesto: number | null;
  peorPuesto: number | null;
  jornadasUltimo: number;
  diasUltimo: number;
  maxVentaja: { pts: number; jornada: number } | null; // mayor ventaja sobre el 2º siendo líder
};

export type LeagueHistory = {
  series: { key: string; name: string; color: string; campeon: boolean; mundiales: number }[];
  snapshots: Snapshot[];
  leadership: Map<string, Leadership>;
  jornadas: number; // en el periodo
  dias: number; // en el periodo
};

export const regularsOf = (players: Player[]) =>
  players
    .filter((p) => p.active && !p.is_wildcard)
    .sort((a, b) => (a.seat_order ?? 99) - (b.seat_order ?? 99) || a.nickname.localeCompare(b.nickname));

export const stars = (p: Pick<Player, "mundiales">) => "★".repeat(p.mundiales ?? 0);
export const playerLabel = (p: Player) => `${p.emoji ? `${p.emoji} ` : ""}${p.nickname}${p.mundiales ? ` ${stars(p)}` : ""}`;

// Calcula liderato, farolillo y puestos sobre un tramo de snapshots (sin la salida)
function leadershipOf(keys: string[], tramo: Snapshot[]): Map<string, Leadership> {
  // El último snapshot de cada día marca quién se fue a casa líder (o último)
  const endOfDay = new Map<number, Snapshot>();
  for (const s of tramo) if (s.diaNumber !== null) endOfDay.set(s.diaNumber, s);
  const finales = [...endOfDay.values()];

  const out = new Map<string, Leadership>();
  for (const k of keys) {
    let run = 0;
    let best = 0;
    let since: number | null = null;
    let ventaja: Leadership["maxVentaja"] = null;
    for (const s of tramo) {
      if (s.leaders.includes(k)) {
        if (run === 0) since = s.number;
        run += 1;
        best = Math.max(best, run);
        const second = Math.max(...Object.keys(s.ranks).filter((o) => o !== k).map((o) => s.totals[o]));
        const lead = s.totals[k] - second;
        if (lead > 0 && (!ventaja || lead > ventaja.pts)) ventaja = { pts: lead, jornada: s.number };
      } else {
        run = 0;
        since = null;
      }
    }
    const ranks = tramo.map((s) => s.ranks[k]).filter((r) => r !== undefined);
    out.set(k, {
      key: k,
      jornadasLider: tramo.filter((s) => s.leaders.includes(k)).length,
      diasLider: finales.filter((s) => s.leaders.includes(k)).length,
      mejorRacha: best,
      liderDesde: since,
      mejorPuesto: ranks.length ? Math.min(...ranks) : null,
      peorPuesto: ranks.length ? Math.max(...ranks) : null,
      jornadasUltimo: tramo.filter((s) => s.lasts.includes(k)).length,
      diasUltimo: finales.filter((s) => s.lasts.includes(k)).length,
      maxVentaja: ventaja,
    });
  }
  return out;
}

export function leagueHistory(
  players: Player[],
  dias: Dia[],
  jornadas: Jornada[],
  results: Result[],
  adjustments: Adjustment[],
): LeagueHistory {
  const regulars = regularsOf(players);
  const keys = regulars.map((p) => p.id);
  const diaById = new Map(dias.map((d) => [d.id, d]));
  const ordered = jornadas.toSorted((a, b) => a.number - b.number);

  const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const joined = new Set<string>(); // aún no han empezado a jugar → no cuentan en la clasificación
  for (const a of adjustments) {
    if (a.jornada_id || !(a.player_id in totals)) continue;
    totals[a.player_id] += a.points;
    joined.add(a.player_id);
  }

  const snapshots: Snapshot[] = [{ number: 0, diaNumber: null, day: null, totals: { ...totals }, leaders: [], lasts: [], ranks: {} }];

  for (const j of ordered) {
    for (const r of results) {
      if (r.jornada_id !== j.id || !(r.player_id in totals)) continue;
      totals[r.player_id] += r.points;
      joined.add(r.player_id);
    }
    for (const a of adjustments) {
      if (a.jornada_id !== j.id || !(a.player_id in totals)) continue;
      totals[a.player_id] += a.points;
      joined.add(a.player_id);
    }
    const playing = keys.filter((k) => joined.has(k));
    const max = Math.max(...playing.map((k) => totals[k]));
    const min = Math.min(...playing.map((k) => totals[k]));
    const dia = j.dia_id ? diaById.get(j.dia_id) : undefined;
    snapshots.push({
      number: j.number,
      diaNumber: dia?.number ?? null,
      day: j.played_on ?? dia?.played_on ?? null,
      totals: { ...totals },
      leaders: playing.filter((k) => totals[k] === max),
      lasts: playing.length > 1 ? playing.filter((k) => totals[k] === min) : [],
      ranks: Object.fromEntries(playing.map((k) => [k, 1 + playing.filter((o) => totals[o] > totals[k]).length])),
    });
  }

  const tramo = snapshots.slice(1);
  const colores = coloresDeLiga(players);
  return {
    series: regulars.map((p) => ({
      key: p.id, name: playerLabel(p), color: colores.get(p.id)!, campeon: Boolean(p.campeon), mundiales: p.mundiales ?? 0,
    })),
    snapshots,
    leadership: leadershipOf(keys, tramo),
    jornadas: tramo.length,
    dias: new Set(tramo.map((s) => s.diaNumber).filter((d) => d !== null)).size,
  };
}

// La misma historia recortada a un periodo: los puntos siguen siendo los acumulados de toda la liga,
// pero liderato, farolillo y gráfica solo miran las jornadas que caen dentro (las sin fecha, solo en "todo").
export function historyIn(h: LeagueHistory, inRange: (day: string | null) => boolean): LeagueHistory {
  const idx = h.snapshots.map((s, i) => (i > 0 && inRange(s.day) ? i : -1)).filter((i) => i > 0);
  if (idx.length === h.snapshots.length - 1) return h;
  const tramo = idx.map((i) => h.snapshots[i]);
  const salida = idx.length ? h.snapshots[idx[0] - 1] : h.snapshots[0];
  return {
    ...h,
    snapshots: [salida, ...tramo],
    leadership: leadershipOf(h.series.map((s) => s.key), tramo),
    jornadas: tramo.length,
    dias: new Set(tramo.map((s) => s.diaNumber).filter((d) => d !== null)).size,
  };
}
