"use client";

import { useCallback, useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { usePermiso } from "@/lib/llave";
import { usePartidas } from "@/lib/partidas";
import { supabase } from "@/lib/supabase";

type Llave = { id: string; nombre: string; activa: boolean; created_at: string; ultimo_uso: string | null };
type Entrada = {
  id: number;
  cuando: string;
  tabla: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  fila: string | null;
  quien: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
};

const cuando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca";

const TABLA: Record<string, string> = {
  partidas: "⚔️ Partida", partida_jugadores: "⚔️ Jugador en partida", partida_movimientos: "❤️ Vida",
  jornadas: "🎲 Jornada", results: "🎲 Resultado", adjustments: "⚖️ Ajuste", events: "🏊 Evento",
  players: "👤 Jugador", league: "🏆 Liga", dias: "📅 Día", periodicos: "📰 Periódico", llaves: "🔑 Llave",
};
const OP = { INSERT: "➕", UPDATE: "✏️", DELETE: "🗑" };

export default function Seguridad() {
  return (
    <AdminGate>
      <Panel />
    </AdminGate>
  );
}

function Panel() {
  const permiso = usePermiso();
  if (permiso.cargando) return null;
  if (permiso.sinSistema)
    return (
      <p className="rounded-lg border border-gold/50 bg-gold/10 p-4 text-sm">
        Falta activar la seguridad: desactiva el registro de usuarios en Supabase y ejecuta <code>supabase/12_seguridad.sql</code>.
      </p>
    );
  if (!permiso.admin)
    return <p className="py-10 text-center text-muted">Esta cuenta no está en la lista de admins.</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">🛡 Seguridad</h1>
      <Llaves />
      <Anuladas />
      <Registro />
    </div>
  );
}

function Llaves() {
  const [llaves, setLlaves] = useState<Llave[]>([]);
  const [nombre, setNombre] = useState("");
  const [nueva, setNueva] = useState<{ nombre: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("llaves").select("id, nombre, activa, created_at, ultimo_uso").order("created_at");
    setError(error?.message ?? null);
    setLlaves(data ?? []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function crear() {
    const n = nombre.trim();
    if (!n) return;
    const { data, error } = await supabase.rpc("crear_llave", { p_nombre: n });
    if (error) return setError(error.message);
    setNueva({ nombre: n, code: data as string });
    setNombre("");
    load();
  }

  async function cambiar(l: Llave) {
    if (l.activa && !confirm(`¿Revocar la llave de ${l.nombre}? Su móvil dejará de poder apuntar.`)) return;
    const { error } = await supabase.from("llaves").update({ activa: !l.activa }).eq("id", l.id);
    if (error) setError(error.message);
    load();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="font-bold">🔑 Llaves</h2>
        <p className="text-sm text-muted">Una por persona. Con ella su móvil puede apuntar partidas, anularlas y subir periódicos. La liga solo la tocas tú.</p>
      </div>

      {nueva && (
        <div className="space-y-2 rounded-xl border-2 border-gold bg-felt p-4 text-center">
          <p className="text-sm text-muted">Llave de {nueva.nombre} · cópiala ahora, no se vuelve a mostrar</p>
          <p className="select-all font-mono text-2xl font-bold tracking-wider text-gold">{nueva.code}</p>
          <div className="flex justify-center gap-2">
            <button onClick={() => navigator.clipboard.writeText(nueva.code)} className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-felt">📋 Copiar</button>
            <button onClick={() => setNueva(null)} className="rounded-full border border-line px-4 py-1.5 text-sm text-muted">Hecho</button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && crear()} placeholder="Nombre (p. ej. Vilanova)" />
        <button onClick={crear} disabled={!nombre.trim()} className="whitespace-nowrap rounded-lg bg-gold px-4 font-semibold text-felt disabled:opacity-40">
          Crear llave
        </button>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}

      <ul className="space-y-1.5">
        {llaves.map((l) => (
          <li key={l.id} className={`flex items-center gap-3 rounded-lg bg-felt px-3 py-2 text-sm ${l.activa ? "" : "opacity-50"}`}>
            <span className="flex-1">
              <span className="font-semibold">{l.nombre}</span>
              <span className="block text-xs text-muted">último uso: {cuando(l.ultimo_uso)}</span>
            </span>
            <button onClick={() => cambiar(l)} className={`rounded-full px-3 py-1 text-xs ${l.activa ? "border border-red/50 text-red" : "border border-line text-muted"}`}>
              {l.activa ? "Revocar" : "Reactivar"}
            </button>
          </li>
        ))}
        {!llaves.length && <li className="text-sm text-muted">Aún no hay llaves.</li>}
      </ul>
    </section>
  );
}

// Partidas anuladas: solo el admin puede devolverlas a las estadísticas
function Anuladas() {
  const { partidas, jugadores } = usePartidas();
  const anuladas = partidas.filter((p) => p.cancelada).toReversed().slice(0, 20);
  if (!anuladas.length) return null;

  async function recuperar(id: string) {
    if (!confirm("¿Recuperar esta partida? Volverá a contar en las estadísticas.")) return;
    const { error } = await supabase.from("partidas").update({ cancelada: false }).eq("id", id);
    if (error) alert(error.message);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <h2 className="font-bold">🗑 Partidas anuladas</h2>
      <ul className="space-y-1.5">
        {anuladas.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-lg bg-felt px-3 py-2 text-sm">
            <span className="flex-1">
              {cuando(p.started_at)}
              <span className="block text-xs text-muted">{jugadores.filter((j) => j.partida_id === p.id).map((j) => j.name).join(", ")}</span>
            </span>
            <button onClick={() => recuperar(p.id)} className="rounded-full border border-line px-3 py-1 text-xs text-muted">Recuperar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function resumen(e: Entrada) {
  const d = e.despues ?? {};
  const a = e.antes ?? {};
  if (e.op === "UPDATE") {
    const cambios = Object.keys(d).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(a[k]));
    return cambios.map((k) => `${k}: ${String(a[k])} → ${String(d[k])}`).join(" · ");
  }
  const x = e.op === "DELETE" ? a : d;
  const campos = ["titulo", "nombre", "nickname", "name", "number", "position", "points", "kind", "lives_after", "reason", "description", "start_lives"];
  return campos.filter((k) => x[k] !== undefined && x[k] !== null).map((k) => `${k}: ${String(x[k])}`).join(" · ");
}

function Registro() {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [conVidas, setConVidas] = useState(false);
  const [quien, setQuien] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from("auditoria").select("*").order("cuando", { ascending: false }).limit(200);
    if (!conVidas) q = q.neq("tabla", "partida_movimientos");
    if (quien) q = q.eq("quien", quien);
    const { data, error } = await q;
    setError(error?.message ?? null);
    setEntradas((data as Entrada[]) ?? []);
  }, [conVidas, quien]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const channel = supabase.channel("lod-auditoria").on("postgres_changes", { event: "INSERT", schema: "public", table: "auditoria" }, () => load()).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const quienes = [...new Set(entradas.map((e) => e.quien))];

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="font-bold">📜 Registro de cambios</h2>
        <p className="text-sm text-muted">Todo lo que se apunta, cambia o borra, con quién lo hizo. Últimos 200.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select value={quien} onChange={(e) => setQuien(e.target.value)} className="!w-auto">
          <option value="">Todos</option>
          {quienes.map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={conVidas} onChange={(e) => setConVidas(e.target.checked)} className="!w-auto" />
          Incluir cada vida del marcador
        </label>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}
      <ul className="divide-y divide-line text-sm">
        {entradas.map((e) => (
          <li key={e.id} className="flex gap-3 py-2">
            <span className="w-24 shrink-0 text-xs text-muted">{cuando(e.cuando)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{OP[e.op]} {TABLA[e.tabla] ?? e.tabla}</span>
              <span className="ml-2 text-xs text-muted">{e.quien}</span>
              <span className="block truncate text-xs text-muted">{resumen(e)}</span>
            </span>
          </li>
        ))}
        {!entradas.length && <li className="py-2 text-muted">Sin cambios todavía.</li>}
      </ul>
    </section>
  );
}
