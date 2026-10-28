"use client";

import { useLeague } from "@/lib/useLeague";
import { Status, PlayerName } from "@/components/Status";

export default function Clasificacion() {
  const { standings, league, playedTotal, loading, error } = useLeague();
  const total = league?.total_jornadas ?? 200;
  const pct = Math.min(100, (playedTotal / total) * 100);
  const leader = standings[0]?.points ?? 0;

  return (
    <div className="space-y-6">
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Liga oficial de dados</p>
        <h1 className="text-3xl font-black">{league?.name ?? "Road to Napicol 2027"}</h1>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-felt">
            <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular text-muted">
            J{playedTotal} / {total}
          </span>
        </div>
      </section>

      <Status loading={loading} error={error} />

      {!loading && !error && (
        <ol className="space-y-2">
          {standings.map((s, i) => (
            <li
              key={s.player.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                i === 0 ? "border-gold/60 bg-gold/10" : "border-line bg-card"
              }`}
            >
              <span className={`tabular w-7 text-center text-lg font-black ${i === 0 ? "text-gold" : "text-muted"}`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  <PlayerName nickname={s.player.nickname} emoji={s.player.emoji} />
                </p>
                <p className="text-xs text-muted">
                  {s.wins > 0 && `🏆 ${s.wins} · `}
                  {s.piscinas > 0 && `🏊 ${s.piscinas} · `}
                  {s.autopiscinas > 0 && `🤦 ${s.autopiscinas} · `}
                  {s.historia > 0 && `📜 ${s.historia} · `}
                  {i > 0 ? `a ${leader - s.points} del líder` : "líder"}
                </p>
              </div>
              <span className="tabular text-2xl font-black">{s.points}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-center text-xs text-muted">
        🏆 victorias en la app · 🏊 piscinas · 🤦 autopiscinas · 📜 puntos de historia
      </p>
    </div>
  );
}
