"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminGate from "@/components/AdminGate";
import { Status, PlayerName } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";
import { supabase } from "@/lib/supabase";
import { defaultPoints } from "@/lib/scoring";
import type { JornadaKind, LeagueEvent } from "@/lib/types";

type PendingEvent = { player_id: string; kind: LeagueEvent["kind"]; description: string };

export default function Registrar() {
  return (
    <AdminGate>
      <Form />
    </AdminGate>
  );
}

function Form() {
  const router = useRouter();
  const { players, nextNumber, loading, error } = useLeague();
  const [number, setNumber] = useState<number | "">("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<JornadaKind>("normal");
  const [game, setGame] = useState("dados");
  const [notes, setNotes] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [manual, setManual] = useState<Record<number, number>>({});
  const [pending, setPending] = useState<PendingEvent[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = players.filter((p) => p.active).sort((a, b) =>
    Number(a.is_wildcard) - Number(b.is_wildcard) ||
    (a.seat_order ?? 99) - (b.seat_order ?? 99),
  );
  const byId = new Map(players.map((p) => [p.id, p]));
  const defaults = defaultPoints(order.length, kind);
  const points = useMemo(
    () => order.map((_, i) => manual[i] ?? defaults?.[i] ?? 0),
    [order, manual, defaults],
  );

  function toggle(id: string) {
    setManual({});
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  async function save() {
    const n = number === "" ? nextNumber : number;
    if (order.length < 2) return setMsg("Marca al menos 2 jugadores en orden de llegada.");
    setBusy(true);
    setMsg(null);
    const { data: j, error: e1 } = await supabase
      .from("jornadas")
      .insert({ number: n, played_on: date, kind, game, notes: notes || null })
      .select()
      .single();
    if (e1 || !j) {
      setBusy(false);
      return setMsg(e1?.message ?? "No se pudo crear la jornada");
    }
    const { error: e2 } = await supabase.from("results").insert(
      order.map((player_id, i) => ({ jornada_id: j.id, player_id, position: i + 1, points: points[i] })),
    );
    const { error: e3 } = pending.length
      ? await supabase.from("events").insert(
          pending.map((p) => ({ ...p, description: p.description || null, jornada_id: j.id })),
        )
      : { error: null };
    setBusy(false);
    if (e2 || e3) {
      await supabase.from("jornadas").delete().eq("id", j.id);
      return setMsg((e2 ?? e3)!.message);
    }
    router.push("/");
  }

  if (loading || error) return <Status loading={loading} error={error} />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Registrar jornada</h1>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted">Nº jornada</span>
          <input
            type="number"
            placeholder={String(nextNumber)}
            value={number}
            onChange={(e) => setNumber(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="text-muted">Fecha</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="text-muted">Tipo</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value as JornadaKind); setManual({}); }}>
            <option value="normal">Normal</option>
            <option value="sobrante">Sobrantes</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted">Juego</span>
          <input value={game} onChange={(e) => setGame(e.target.value)} />
        </label>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">
          Orden de llegada <span className="text-sm font-normal text-muted">— toca en orden: 1º, 2º, 3º…</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {active.map((p) => {
            const pos = order.indexOf(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  pos >= 0 ? "border-gold bg-gold text-felt font-semibold" : "border-line bg-card"
                } ${p.is_wildcard ? "border-dashed" : ""}`}
              >
                {pos >= 0 && `${pos + 1}º · `}
                <PlayerName nickname={p.nickname} emoji={p.emoji} />
              </button>
            );
          })}
        </div>
      </section>

      {order.length > 0 && (
        <section className="rounded-xl border border-line bg-card p-3">
          {!defaults && (
            <p className="mb-2 text-xs text-gold">
              No hay tabla para {order.length} jugadores: pon los puntos a mano.
            </p>
          )}
          <ol className="space-y-2">
            {order.map((id, i) => (
              <li key={id} className="flex items-center gap-3">
                <span className="tabular w-6 text-muted">{i + 1}º</span>
                <span className="flex-1">{byId.get(id)?.nickname}</span>
                <input
                  type="number"
                  className="!w-20 text-right"
                  value={points[i]}
                  onChange={(e) => setManual((m) => ({ ...m, [i]: Number(e.target.value) }))}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Piscinas / autopiscinas / historia</h2>
        {pending.map((ev, i) => (
          <div key={i} className="flex gap-2">
            <select value={ev.player_id} onChange={(e) => setPending((p) => p.map((x, k) => (k === i ? { ...x, player_id: e.target.value } : x)))}>
              {active.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
            </select>
            <select value={ev.kind} onChange={(e) => setPending((p) => p.map((x, k) => (k === i ? { ...x, kind: e.target.value as LeagueEvent["kind"] } : x)))}>
              <option value="piscina">🏊 Piscina</option>
              <option value="autopiscina">🤦 Autopiscina</option>
              <option value="historia">📜 Historia</option>
            </select>
            <input placeholder="Detalle" value={ev.description} onChange={(e) => setPending((p) => p.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
            <button onClick={() => setPending((p) => p.filter((_, k) => k !== i))} className="px-2 text-red">✕</button>
          </div>
        ))}
        <button
          onClick={() => active[0] && setPending((p) => [...p, { player_id: active[0].id, kind: "piscina", description: "" }])}
          className="text-sm text-gold"
        >
          + Añadir evento
        </button>
      </section>

      <label className="block text-sm">
        <span className="text-muted">Notas</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {msg && <p className="text-sm text-red">{msg}</p>}
      <button onClick={save} disabled={busy} className="w-full rounded-xl bg-gold py-3 font-black text-felt disabled:opacity-50">
        {busy ? "Guardando…" : `Guardar J${number === "" ? nextNumber : number}`}
      </button>
    </div>
  );
}
