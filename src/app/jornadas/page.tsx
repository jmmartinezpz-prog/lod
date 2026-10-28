"use client";

import { useState } from "react";
import { useLeague } from "@/lib/useLeague";
import { Status, PlayerName } from "@/components/Status";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import type { Jornada } from "@/lib/types";

const ICON = { piscina: "🏊", autopiscina: "🤦", historia: "📜" } as const;

export default function Jornadas() {
  const { dias, jornadas, results, players, adjustments, events, loading, error } = useLeague();
  const { session } = useSession();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string | null) => (id ? byId.get(id)?.nickname ?? "?" : "?");

  async function removeJornada(id: string, n: number) {
    if (!confirm(`¿Borrar la J${n} y todos sus resultados?`)) return;
    await supabase.from("jornadas").delete().eq("id", id);
  }
  async function setDate(diaId: string, value: string) {
    await supabase.from("dias").update({ played_on: value || null }).eq("id", diaId);
  }

  // Agrupar jornadas por día (las que no tienen día van a "Sin día")
  const groups = [
    ...dias.map((d) => ({ dia: d, items: jornadas.filter((j) => j.dia_id === d.id) })),
    { dia: null, items: jornadas.filter((j) => !j.dia_id || !dias.some((d) => d.id === j.dia_id)) },
  ].filter((g) => g.items.length > 0);

  function dayTotals(items: Jornada[]) {
    const ids = new Set(items.map((j) => j.id));
    const sum = new Map<string, number>();
    for (const r of results) if (ids.has(r.jornada_id)) sum.set(r.player_id, (sum.get(r.player_id) ?? 0) + r.points);
    for (const a of adjustments) if (a.jornada_id && ids.has(a.jornada_id)) sum.set(a.player_id, (sum.get(a.player_id) ?? 0) + a.points);
    return players
      .filter((p) => !p.is_wildcard && sum.has(p.id))
      .map((p) => ({ p, pts: sum.get(p.id)! }))
      .sort((a, b) => b.pts - a.pts);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black">Jornadas por día</h1>
      <Status loading={loading} error={error} />

      {!loading && !error && jornadas.length === 0 && (
        <p className="text-muted">Aún no hay jornadas registradas.</p>
      )}

      {groups.map(({ dia, items }, idx) => {
        const key = dia?.id ?? "none";
        const isOpen = open[key] ?? idx === 0;
        const totals = dayTotals(items);
        const sorted = [...items].sort((a, b) => a.number - b.number);
        return (
          <section key={key} className="rounded-2xl border border-line bg-card/60">
            <button
              onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <div className="flex-1">
                <h2 className="text-xl font-black">
                  {dia ? `Día ${dia.number}` : "Sin día"}
                  <span className="ml-2 text-sm font-normal text-muted">
                    J{sorted[0].number}–J{sorted[sorted.length - 1].number} · {items.length} partidas
                  </span>
                </h2>
                <p className="text-xs text-muted">
                  {dia?.played_on ? new Date(dia.played_on).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Fecha sin poner"}
                  {dia?.notes ? ` · ${dia.notes}` : ""}
                </p>
              </div>
              <span className="text-muted">{isOpen ? "▲" : "▼"}</span>
            </button>

            <div className="flex flex-wrap gap-2 px-4 pb-3 text-xs">
              {totals.map(({ p, pts }, i) => (
                <span key={p.id} className={`rounded-full px-2 py-1 ${i === 0 ? "bg-gold text-felt font-semibold" : "bg-felt text-ink"}`}>
                  {p.nickname} {pts > 0 ? "+" : ""}{pts}
                </span>
              ))}
            </div>

            {session && dia && (
              <label className="flex items-center gap-2 px-4 pb-3 text-xs text-muted">
                Fecha del día
                <input type="date" className="!w-auto !py-1" defaultValue={dia.played_on ?? ""} onBlur={(e) => setDate(dia.id, e.target.value)} />
              </label>
            )}

            {isOpen && (
              <div className="space-y-3 border-t border-line p-4">
                {sorted.map((j) => {
                  const rs = results.filter((r) => r.jornada_id === j.id).sort((a, b) => a.position - b.position);
                  const ev = events.filter((e) => e.jornada_id === j.id);
                  const adj = adjustments.filter((a) => a.jornada_id === j.id);
                  return (
                    <article key={j.id} className="rounded-xl border border-line bg-card p-3">
                      <header className="mb-2 flex items-baseline gap-2">
                        <h3 className="font-black">J{j.number}</h3>
                        {j.kind === "sobrante" && <span className="rounded-full bg-gold/20 px-2 text-xs text-gold">Sobrantes</span>}
                        {j.game !== "dados" && <span className="rounded-full bg-red/20 px-2 text-xs text-red">{j.game}</span>}
                      </header>
                      <ol className="space-y-0.5 text-sm">
                        {rs.map((r) => {
                          const p = byId.get(r.player_id);
                          return (
                            <li key={r.id} className={`flex gap-2 ${p?.is_wildcard ? "text-muted" : ""}`}>
                              <span className="tabular w-5 text-muted">{r.position}.</span>
                              <span className="flex-1">
                                {p && <PlayerName nickname={p.nickname} emoji={p.emoji} />}
                                {p?.is_wildcard && <span className="text-xs"> (wildcard)</span>}
                              </span>
                              <span className="tabular font-semibold">+{r.points}</span>
                            </li>
                          );
                        })}
                      </ol>
                      {(ev.length > 0 || adj.length > 0) && (
                        <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-muted">
                          {adj.map((a) => (
                            <li key={a.id}>
                              ⚖️ {name(a.player_id)} {a.points > 0 ? "+" : ""}{a.points}{a.reason ? ` — ${a.reason}` : ""}
                            </li>
                          ))}
                          {ev.map((e) => (
                            <li key={e.id}>
                              {ICON[e.kind]} {name(e.player_id)}
                              {e.kind === "piscina" && e.target_player_id && ` → ${name(e.target_player_id)}`}
                              {e.kind === "historia" && ` +${e.value} historia`}
                              {e.description ? ` — ${e.description}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      {j.notes && <p className="mt-2 text-xs italic text-muted">{j.notes}</p>}
                      {session && (
                        <button onClick={() => removeJornada(j.id, j.number)} className="mt-2 text-xs text-red">
                          Borrar jornada
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
