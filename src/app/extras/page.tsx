"use client";

import { useState } from "react";
import AdminGate from "@/components/AdminGate";
import { Status } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";
import { supabase } from "@/lib/supabase";

type Kind = "sancion" | "bonus" | "alta" | "piscina" | "autopiscina" | "historia";
const LABEL: Record<string, string> = {
  sancion: "⚖️ Sanción", bonus: "✨ Bonus", alta: "🆕 Alta", arrastre: "📦 Arrastre",
  piscina: "🏊 Piscina", autopiscina: "🤦 Autopiscina", historia: "📜 Historia",
};

export default function Extras() {
  return (
    <AdminGate>
      <Panel />
    </AdminGate>
  );
}

function Panel() {
  const { players, adjustments, events, loading, error } = useLeague();
  const [player, setPlayer] = useState("");
  const [kind, setKind] = useState<Kind>("sancion");
  const [value, setValue] = useState(1);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const isAdjustment = kind === "sancion" || kind === "bonus" || kind === "alta";
  const byId = new Map(players.map((p) => [p.id, p.nickname]));

  async function save() {
    const player_id = player || players[0]?.id;
    if (!player_id) return;
    const { error } = isAdjustment
      ? await supabase.from("adjustments").insert({
          player_id, kind, reason: reason || null,
          points: kind === "sancion" ? -Math.abs(value) : Math.abs(value),
        })
      : await supabase.from("events").insert({
          player_id, kind, value, description: reason || null,
          target_player_id: kind === "piscina" ? target || players.find((p) => p.id !== player_id)?.id : kind === "autopiscina" ? player_id : null,
        });
    setMsg(error ? error.message : "Guardado ✔");
    if (!error) setReason("");
  }

  async function remove(table: "adjustments" | "events", id: string) {
    if (!confirm("¿Borrar este registro?")) return;
    await supabase.from(table).delete().eq("id", id);
  }

  if (loading || error) return <Status loading={loading} error={error} />;

  const log = [
    ...adjustments.map((a) => ({ table: "adjustments" as const, id: a.id, player: a.player_id, kind: a.kind, v: a.points, text: a.reason, at: a.created_at })),
    ...events.map((e) => ({
      table: "events" as const, id: e.id, player: e.player_id, kind: e.kind, v: e.value, at: e.created_at,
      text: [e.kind === "piscina" && e.target_player_id ? `→ ${byId.get(e.target_player_id)}` : null, e.description].filter(Boolean).join(" "),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Sanciones y extras</h1>
      <div className="space-y-3 rounded-xl border border-line bg-card p-4">
        <select value={player} onChange={(e) => setPlayer(e.target.value)}>
          {players.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {(["sancion", "bonus", "alta", "piscina", "autopiscina", "historia"] as Kind[]).map((k) => (
              <option key={k} value={k}>{LABEL[k]}</option>
            ))}
          </select>
          <input type="number" min={1} value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </div>
        {kind === "piscina" && (
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Piscina a…</option>
            {players.filter((p) => p.id !== (player || players[0]?.id)).map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
        )}
        <p className="text-xs text-muted">
          {isAdjustment ? "Suma o resta puntos de liga." : "No cambia los puntos de liga, solo el palmarés."}
        </p>
        <input placeholder="Motivo / detalle" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button onClick={save} className="w-full rounded-lg bg-gold py-2 font-bold text-felt">Guardar</button>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>

      <ul className="space-y-1 text-sm">
        {log.map((l) => (
          <li key={l.id} className="flex items-center gap-2 border-b border-line py-1.5">
            <span className="w-28 shrink-0">{LABEL[l.kind]}</span>
            <span className="flex-1 truncate">
              {byId.get(l.player)} <span className="text-muted">{l.text}</span>
            </span>
            <span className="tabular">{l.table === "adjustments" && l.v > 0 ? "+" : ""}{l.v}</span>
            <button onClick={() => remove(l.table, l.id)} className="px-1 text-red">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
