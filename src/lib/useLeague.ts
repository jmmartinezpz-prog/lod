"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { escucharCambios, supabase, supabaseConfigured } from "./supabase";
import { marcarCampeones } from "@/components/Status";
import type { Adjustment, Dia, Jornada, League, LeagueEvent, Player, Result } from "./types";

export type Standing = {
  player: Player;
  points: number;
  played: number;
  wins: number;
  sobrantes: number; // jornadas de sobrantes ganadas
  piscinas: number; // entregadas
  recibidas: number;
  balance: number; // entregadas - recibidas
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
    marcarCampeones((p.data ?? []).filter((x: Player) => x.campeon).map((x: Player) => x.nickname));
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
    return escucharCambios("lod-live", ["players", "dias", "jornadas", "results", "adjustments", "events", "league"], load);
  }, [load]);

  const base = useMemo<Standing[]>(() => {
    const sobrante = new Set(jornadas.filter((j) => j.kind === "sobrante").map((j) => j.id));
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
          sobrantes: mine.filter((r) => r.position === 1 && sobrante.has(r.jornada_id)).length,
          piscinas: sum("piscina"),
          recibidas: events
            .filter((e) => e.kind === "piscina" && e.target_player_id === player.id)
            .reduce((s, e) => s + e.value, 0),
          balance:
            sum("piscina") -
            events
              .filter((e) => e.kind === "piscina" && e.target_player_id === player.id)
              .reduce((s, e) => s + e.value, 0),
          podios: mine.filter((r) => r.position <= 3).length,
          autopiscinas: sum("autopiscina"),
          historia: sum("historia"),
          adjustments: adjPts,
        };
      });
    return rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [players, results, adjustments, events, jornadas]);

  // 👑 al líder y 🕳️ al que está en el pozo (último), según la clasificación de ahora mismo:
  // se mueven solos en cuanto cambia la liga. La 👑 fija de la base de datos se ignora.
  const { marcados, standings } = useMemo(() => {
    const lider = base[0]?.player.id;
    const pozo = base.length > 1 ? base.at(-1)!.player.id : null;
    const marcados = players.map((p) => {
      const fijo = (p.emoji ?? "").replace(/👑/gu, "").trim();
      const marca = p.id === lider ? "👑" : p.id === pozo ? "🕳️" : "";
      return { ...p, emoji: [marca, fijo].filter(Boolean).join(" ") || null };
    });
    const byId = new Map(marcados.map((p) => [p.id, p]));
    return { marcados, standings: base.map((s) => ({ ...s, player: byId.get(s.player.id)! })) };
  }, [players, base]);

  const playedTotal = (league?.jornadas_previas ?? 0) + jornadas.length;
  const nextNumber =
    Math.max(league?.jornadas_previas ?? 0, ...jornadas.map((j) => j.number)) + 1;

  return {
    players: marcados, dias, jornadas, results, adjustments, events, league,
    standings, playedTotal, nextNumber, loading, error, reload: load,
  };
}
