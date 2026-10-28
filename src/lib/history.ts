import { PALETTE } from "./partidas";
import type { Adjustment, Dia, Jornada, Player, Result } from "./types";

// Foto de la clasificación justo después de cada jornada (índice 0 = antes de empezar)
export type Snapshot = {
  number: number; // nº de jornada (0 = salida)
  diaNumber: number | null;
  totals: Record<string, number>;
  leaders: string[]; // empatados en cabeza cuentan todos
};

export type Leadership = {
  key: string;
  jornadasLider: number;
  diasLider: number;
  mejorRacha: number; // jornadas seguidas como líder
  liderDesde: number | null; // jornada desde la que es líder ahora mismo
  mejorPuesto: number | null;
  peorPuesto: number | null;
};

export type LeagueHistory = {
  series: { key: string; name: string; color: string }[];
  snapshots: Snapshot[];
  leadership: Map<string, Leadership>;
};

export const regularsOf = (players: Player[]) =>
  players
    .filter((p) => p.active && !p.is_wildcard)
    .sort((a, b) => (a.seat_order ?? 99) - (b.seat_order ?? 99) || a.nickname.localeCompare(b.nickname));

export const playerLabel = (p: Player) => `${p.emoji ? `${p.emoji} ` : ""}${p.nickname}`;

export function leagueHistory(
  players: Player[],
  dias: Dia[],
  jornadas: Jornada[],
  results: Result[],
  adjustments: Adjustment[],
): LeagueHistory {
  const regulars = regularsOf(players);
  const keys = regulars.map((p) => p.id);
  const diaNumber = new Map(dias.map((d) => [d.id, d.number]));
  const ordered = jornadas.toSorted((a, b) => a.number - b.number);

  const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const joined = new Set<string>(); // aún no han empezado a jugar → no cuentan en la clasificación
  for (const a of adjustments) {
    if (a.jornada_id || !(a.player_id in totals)) continue;
    totals[a.player_id] += a.points;
    joined.add(a.player_id);
  }

  const snapshots: Snapshot[] = [{ number: 0, diaNumber: null, totals: { ...totals }, leaders: [] }];
  const ranks = new Map<string, number[]>(keys.map((k) => [k, []]));

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
    for (const k of playing) ranks.get(k)!.push(1 + playing.filter((o) => totals[o] > totals[k]).length);
    snapshots.push({
      number: j.number,
      diaNumber: j.dia_id ? diaNumber.get(j.dia_id) ?? null : null,
      totals: { ...totals },
      leaders: playing.filter((k) => totals[k] === max),
    });
  }

  // El último snapshot de cada día marca quién se fue a casa líder
  const endOfDay = new Map<number, Snapshot>();
  for (const s of snapshots) if (s.diaNumber !== null) endOfDay.set(s.diaNumber, s);

  const leadership = new Map<string, Leadership>();
  for (const k of keys) {
    let run = 0;
    let best = 0;
    let since: number | null = null;
    for (const s of snapshots.slice(1)) {
      if (s.leaders.includes(k)) {
        if (run === 0) since = s.number;
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
        since = null;
      }
    }
    const r = ranks.get(k)!;
    leadership.set(k, {
      key: k,
      jornadasLider: snapshots.filter((s) => s.leaders.includes(k)).length,
      diasLider: [...endOfDay.values()].filter((s) => s.leaders.includes(k)).length,
      mejorRacha: best,
      liderDesde: since,
      mejorPuesto: r.length ? Math.min(...r) : null,
      peorPuesto: r.length ? Math.max(...r) : null,
    });
  }

  return {
    series: regulars.map((p, i) => ({ key: p.id, name: playerLabel(p), color: PALETTE[i % PALETTE.length] })),
    snapshots,
    leadership,
  };
}
