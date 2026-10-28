"use client";

import { useLeague } from "@/lib/useLeague";
import { Status, PlayerName } from "@/components/Status";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

export default function Jornadas() {
  const { jornadas, results, players, adjustments, events, league, loading, error } = useLeague();
  const { session } = useSession();
  const byId = new Map(players.map((p) => [p.id, p]));

  async function remove(id: string, n: number) {
    if (!confirm(`¿Borrar la J${n} y todos sus resultados?`)) return;
    await supabase.from("jornadas").delete().eq("id", id);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Jornadas</h1>
      <Status loading={loading} error={error} />

      {!loading && !error && jornadas.length === 0 && (
        <p className="text-muted">Aún no hay jornadas registradas en la app.</p>
      )}

      {jornadas.map((j) => {
        const rs = results.filter((r) => r.jornada_id === j.id).sort((a, b) => a.position - b.position);
        const ev = events.filter((e) => e.jornada_id === j.id);
        const adj = adjustments.filter((a) => a.jornada_id === j.id);
        return (
          <article key={j.id} className="rounded-xl border border-line bg-card p-4">
            <header className="mb-2 flex items-baseline gap-2">
              <h2 className="text-lg font-black">J{j.number}</h2>
              {j.kind === "sobrante" && (
                <span className="rounded-full bg-gold/20 px-2 text-xs text-gold">Sobrantes</span>
              )}
              {j.game !== "dados" && (
                <span className="rounded-full bg-red/20 px-2 text-xs text-red">{j.game}</span>
              )}
              <span className="ml-auto text-xs text-muted">
                {new Date(j.played_on).toLocaleDateString("es-ES")}
              </span>
            </header>
            <ol className="space-y-1 text-sm">
              {rs.map((r) => {
                const p = byId.get(r.player_id);
                return (
                  <li key={r.id} className="flex gap-2">
                    <span className="tabular w-5 text-muted">{r.position}.</span>
                    <span className="flex-1">{p && <PlayerName nickname={p.nickname} emoji={p.emoji} />}</span>
                    <span className="tabular font-semibold">+{r.points}</span>
                  </li>
                );
              })}
            </ol>
            {(ev.length > 0 || adj.length > 0) && (
              <ul className="mt-2 border-t border-line pt-2 text-xs text-muted">
                {ev.map((e) => (
                  <li key={e.id}>
                    {e.kind === "piscina" ? "🏊" : e.kind === "autopiscina" ? "🤦" : "📜"}{" "}
                    {byId.get(e.player_id)?.nickname}
                    {e.description ? ` — ${e.description}` : ""}
                  </li>
                ))}
                {adj.map((a) => (
                  <li key={a.id}>
                    ⚖️ {byId.get(a.player_id)?.nickname} {a.points > 0 ? "+" : ""}
                    {a.points} {a.reason ? `— ${a.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {j.notes && <p className="mt-2 text-xs italic text-muted">{j.notes}</p>}
            {session && (
              <button onClick={() => remove(j.id, j.number)} className="mt-2 text-xs text-red">
                Borrar jornada
              </button>
            )}
          </article>
        );
      })}

      {league && league.jornadas_previas > 0 && (
        <p className="text-center text-xs text-muted">
          J1–J{league.jornadas_previas} jugadas antes de la app (incluidas como arrastre).
        </p>
      )}
    </div>
  );
}
