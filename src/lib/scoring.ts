import type { JornadaKind } from "./types";

// Tablas de puntos según nº de jugadores y tipo de jornada
const TABLES: Record<number, Record<JornadaKind, number[]>> = {
  5: { normal: [5, 3, 2, 1, 0], sobrante: [9, 6, 4, 2, 0] },
  4: { normal: [4, 2, 1, 0], sobrante: [7, 4, 2, 0] },
};

/** Puntos por defecto para cada posición. null = no hay tabla para ese nº de jugadores. */
export function defaultPoints(numPlayers: number, kind: JornadaKind): number[] | null {
  return TABLES[numPlayers]?.[kind] ?? null;
}
