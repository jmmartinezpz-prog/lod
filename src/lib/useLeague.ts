"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import type { Adjustment, Dia, Jornada, League, LeagueEvent, Player, Result } from "./types";

export type Standing = {
  player: Player;
  points: number;
  played: number;
  wins: number;
  piscinas: number; // entregadas
  recibidas: number;
  podios: number;
  autopiscinas: number;
  historia: number;
  adjustments: number;
};

export function useLeague() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [dias, setDias] = useState<Dia[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Faltan las variables de Supabase (.env.local).");
      setLoading(false);
      return;
    }
    const [p, j, r, a, e, l, d] = await Promise.all([
      supabase.from("players").select("*").order("nickname"),
      supabase.from("jornadas").select("*").order("number", { ascending: false }),
      supabase.from("results").select("*"),
      supabase.from("adjustments").select("*").order("created_at", { ascending: false }),
      supabase.from("events").select("*").order("created_at", { ascending: false }),
      supabase.from("league").select("*").eq("id", 1).single(),
      supabase.from("dias").select("*").order("number", { ascending: false }),
    ]);
    // Si aún no se ha ejecutado 04_historico.sql, la app funciona igual sin días
    const firstError = [p, j, r, a, e, l].find((x) => x.error)?.error;
    if (firstError) setError(firstError.message);
    else setError(null);
    setPlayers(p.data ?? []);
    setJornadas(j.data ?? []);
    setResults(r.data ?? []);
    setAdjustments(a.data ?? []);
    setEvents(e.data ?? []);
    setLeague(l.data ?? null);
    setDias(d.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!supabaseConfigured) return;
    // Solo las tablas de la liga: los movimientos del modo juego no deben recargarla
    let channel = supabase.channel("lod-live");
    for (const table of ["players", "dias", "jornadas", "results", "adjustments", "events", "league"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => load());
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const standings = useMemo<Standing[]>(() => {
    const rows = players
      .filter((p) => !p.is_wildcard)
      .map((player) => {
        const mine = results.filter((r) => r.player_id === player.id);
        const adj = adjustments.filter((a) => a.player_id === player.id);
        const ev = events.filter((e) => e.player_id === player.id);
        const sum = (kind: LeagueEvent["kind"]) =>
          ev.filter((e) => e.kind === kind).reduce((s, e) => s + e.value, 0);
        const adjPts = adj.reduce((s, a) => s + a.points, 0);
        return {
          player,
          points: mine.reduce((s, r) => s + r.points, 0) + adjPts,
          played: mine.length,
          wins: mine.filter((r) => r.position === 1).length,
          piscinas: sum("piscina"),
          recibidas: events
            .filter((e) => e.kind === "piscina" && e.target_player_id === player.id)
            .reduce((s, e) => s + e.value, 0),
          podios: mine.filter((r) => r.position <= 3).length,
          autopiscinas: sum("autopiscina"),
          historia: sum("historia"),
          adjustments: adjPts,
        };
      });
    return rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [players, results, adjustments, events]);

  const playedTotal = (league?.jornadas_previas ?? 0) + jornadas.length;
  const nextNumber =
    Math.max(league?.jornadas_previas ?? 0, ...jornadas.map((j) => j.number)) + 1;

  return {
    players, dias, jornadas, results, adjustments, events, league,
    standings, playedTotal, nextNumber, loading, error, reload: load,
  };
}
