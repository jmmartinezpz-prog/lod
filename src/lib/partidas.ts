"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { escucharCambios, supabase, supabaseConfigured } from "./supabase";
import { defaultPoints } from "./scoring";
import type { JornadaKind } from "./types";

// Colores de jugador: validados para daltonismo sobre el fondo de la app.
// Los 5 primeros van a los fijos por orden de mesa; el resto, a wildcards.
export const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// Colores para elegir en el modo juego: los 8 de arriba (por defecto) + 10 más, todos con texto blanco legible
export const GAME_COLORS: { hex: string; name: string }[] = [
  { hex: "#3987e5", name: "Azul" },
  { hex: "#d95926", name: "Naranja" },
  { hex: "#199e70", name: "Turquesa" },
  { hex: "#c98500", name: "Mostaza" },
  { hex: "#d55181", name: "Rosa" },
  { hex: "#008300", name: "Verde" },
  { hex: "#9085e9", name: "Lavanda" },
  { hex: "#e66767", name: "Coral" },
  { hex: "#0d4fa8", name: "Azul marino" },
  { hex: "#12a4b8", name: "Cian" },
  { hex: "#6a3fc8", name: "Morado" },
  { hex: "#b5179e", name: "Magenta" },
  { hex: "#c62828", name: "Rojo" },
  { hex: "#6f9e12", name: "Lima" },
  { hex: "#8d5a2b", name: "Marrón" },
  { hex: "#5f6b7a", name: "Gris pizarra" },
  { hex: "#ef7fa6", name: "Chicle" },
  { hex: "#2b2b2b", name: "Negro" },
];

export type Partida = { id: string; started_at: string; ended_at: string | null; start_lives: number; kind?: JornadaKind; cancelada?: boolean; en_liga?: boolean };

export type PartidaJugador = {
  id: string;
  partida_id: string;
  player_id: string | null;
  name: string;
  color: string;
  seat: number;
};

export type Movimiento = {
  id: string;
  partida_id: string;
  jugador_id: string;
  delta: number;
  lives_after: number; // -1 = BUST
  created_at: string;
  kind: "vida" | "piscina";
  from_jugador_id: string | null; // quién lanzó la piscina
};

// Partida en curso tal como la guarda el móvil. lives: 0 = vida cero, -1 = BUST.
export type Seat = { id: string; playerId: string | null; name: string; color: string; lives: number };
export type Game = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  start: number;
  kind: JornadaKind; // decide la tabla de puntos
  seats: Seat[];
  synced: boolean; // partida y jugadores ya están en Supabase
  pending: Movimiento[]; // movimientos aún sin subir
  zeroGoneBy: string | null; // quién hizo BUST siendo el único en vida cero (desde entonces no hay vida cero)
  bustOrder: string[]; // ids en el orden en que han reventado
  secadas: Record<string, number>; // piscinas recibidas en esta partida, por asiento
  tiradas: Record<string, number>; // piscinas lanzadas en esta partida, por asiento
};

// crypto.randomUUID solo existe en https; en la red local (http) hace falta el plan B.
export function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newGame(start: number, kind: JornadaKind, seats: Omit<Seat, "id" | "lives">[]): Game {
  return {
    id: uuid(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    start,
    kind,
    seats: seats.map((s) => ({ ...s, id: uuid(), lives: start })),
    synced: false,
    pending: [],
    zeroGoneBy: null,
    bustOrder: [],
    secadas: {},
    tiradas: {},
  };
}

function move(g: Game, seat: Seat, lives: number, zeroGoneBy: string | null, kind: Movimiento["kind"], from: string | null): Game {
  return {
    ...g,
    zeroGoneBy,
    bustOrder: lives < 0 ? [...g.bustOrder, seat.id] : g.bustOrder.filter((id) => id !== seat.id),
    seats: g.seats.map((s) => (s.id === seat.id ? { ...s, lives } : s)),
    pending: [
      ...g.pending,
      {
        id: uuid(), partida_id: g.id, jugador_id: seat.id, delta: lives - seat.lives, lives_after: lives,
        created_at: new Date().toISOString(), kind, from_jugador_id: from,
      },
    ],
  };
}

// Quitar una vida. Todos tienen vida cero hasta que el único que estaba en 0 hace BUST;
// a partir de ahí quien pierde su última vida revienta directamente.
export function hit(g: Game, id: string, kind: Movimiento["kind"] = "vida", from: string | null = null): Game {
  const seat = g.seats.find((s) => s.id === id);
  if (!seat || seat.lives < 0) return g;
  let lives = seat.lives - 1;
  let zeroGoneBy = g.zeroGoneBy;
  if (lives === 0 && zeroGoneBy) lives = -1;
  if (lives === -1 && !zeroGoneBy && !g.seats.some((s) => s.id !== id && s.lives === 0)) zeroGoneBy = id;
  return move(g, seat, lives, zeroGoneBy, kind, from);
}

// Sumar una vida (también sirve para deshacer un BUST por error)
export function heal(g: Game, id: string): Game {
  const seat = g.seats.find((s) => s.id === id);
  if (!seat) return g;
  if (seat.lives >= 0) return move(g, seat, seat.lives + 1, g.zeroGoneBy, "vida", null);
  const restores = !g.zeroGoneBy || g.zeroGoneBy === id;
  return move(g, seat, restores ? 0 : 1, g.zeroGoneBy === id ? null : g.zeroGoneBy, "vida", null);
}

// Siempre se juega a 5: con wildcards los puntos se reparten igual (los que sobren, 0)
export const pointsFor = (kind: JornadaKind, players: number, place: number) =>
  (defaultPoints(players, kind) ?? defaultPoints(5, kind)!)[place - 1] ?? 0;

// Clasificación de la partida: vivos por vidas, luego los reventados del último al primero en caer.
export function finalStandings(g: Game) {
  const alive = g.seats.filter((s) => s.lives >= 0).sort((a, b) => b.lives - a.lives);
  const busted = g.bustOrder.toReversed().map((id) => g.seats.find((s) => s.id === id)!).filter(Boolean);
  return [...alive, ...busted].map((s, i) => ({ ...s, place: i + 1, points: pointsFor(g.kind, g.seats.length, i + 1) }));
}

// Sube lo que falte. Todo son upserts con ids del móvil, así que repetir es inocuo.
// Marca una partida como cancelada: no se borra, pero las estadísticas la ignoran.
export async function cancelPartida(id: string): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const { error } = await supabase.from("partidas").update({ cancelada: true }).eq("id", id);
  return error?.message ?? null;
}

// Cancela la partida en curso. Si nunca llegó a subirse no hay nada que marcar.
export async function cancelGame(g: Game): Promise<string | null> {
  if (!supabaseConfigured || (!g.synced && g.pending.length === 0)) return null;
  const { error } = await supabase
    .from("partidas")
    .upsert({ id: g.id, started_at: g.startedAt, ended_at: new Date().toISOString(), start_lives: g.start, kind: g.kind, cancelada: true });
  return error?.message ?? null;
}

// Pasa la partida terminada a la liga: la base de datos crea su jornada con puntos y piscinas
export async function cerrarPartida(id: string): Promise<{ jornada: number | null; error: string | null }> {
  if (!supabaseConfigured) return { jornada: null, error: "Supabase no configurado" };
  const { data, error } = await supabase.rpc("cerrar_partida", { p_id: id });
  return { jornada: (data as number | null) ?? null, error: error?.message ?? null };
}

export async function syncGame(g: Game): Promise<{ header: boolean; sent: string[]; error: string | null }> {
  if (!supabaseConfigured) return { header: false, sent: [], error: "Supabase no configurado" };
  if (!g.synced) {
    const p = await supabase
      .from("partidas")
      .upsert({ id: g.id, started_at: g.startedAt, ended_at: g.endedAt, start_lives: g.start, kind: g.kind });
    if (p.error) return { header: false, sent: [], error: p.error.message };
    const j = await supabase.from("partida_jugadores").upsert(
      g.seats.map((s, i) => ({ id: s.id, partida_id: g.id, player_id: s.playerId, name: s.name, color: s.color, seat: i })),
    );
    if (j.error) return { header: false, sent: [], error: j.error.message };
  }
  if (g.pending.length) {
    const m = await supabase.from("partida_movimientos").upsert(g.pending);
    if (m.error) return { header: true, sent: [], error: m.error.message };
  }
  return { header: true, sent: g.pending.map((m) => m.id), error: null };
}

// Supabase devuelve como mucho 1000 filas por consulta
async function fetchAll<T>(table: string, order: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

export function usePartidas() {
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [jugadores, setJugadores] = useState<PartidaJugador[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const [p, j, m] = await Promise.all([
        fetchAll<Partida>("partidas", "started_at"),
        fetchAll<PartidaJugador>("partida_jugadores", "seat"),
        fetchAll<Movimiento>("partida_movimientos", "created_at"),
      ]);
      setPartidas(p);
      setJugadores(j);
      setMovimientos(m);
      setError(null);
    } catch (e) {
      setError((e as { message?: string }).message ?? "Error cargando partidas");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!supabaseConfigured) return;
    // Durante una partida llegan muchos cambios seguidos: se agrupan en una recarga.
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 400);
    };
    const dejar = escucharCambios("lod-juego", ["partidas", "partida_jugadores", "partida_movimientos"], schedule);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      dejar();
    };
  }, [load]);

  return { partidas, jugadores, movimientos, loading, error };
}
