"use client";

import { useEffect, useMemo, useState } from "react";
import { Status } from "@/components/Status";
import { leagueHistory, regularsOf } from "@/lib/history";
import { usePartidas } from "@/lib/partidas";
import { ARCHIVO, PLANTILLA, htmlDe, promptDelDia, tituloDe, usePeriodicos, type Periodico } from "@/lib/prensa";
import { dayOf, gameToday, resumir } from "@/lib/stats";
import { supabase } from "@/lib/supabase";
import { useLeague } from "@/lib/useLeague";
import { useSession } from "@/lib/useSession";

const fechaCorta = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

const notasKey = (fecha: string) => `lod-prensa-notas-${fecha}`;
const leerNotas = (fecha: string) => {
  try {
    return localStorage.getItem(notasKey(fecha)) ?? "";
  } catch {
    return "";
  }
};

export default function Prensa() {
  const league = useLeague();
  const juego = usePartidas();
  const { todos, error: prensaError, reload } = usePeriodicos();
  const { session } = useSession();
  const [abierto, setAbierto] = useState<Periodico | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📰 Prensa</h1>
        <p className="text-sm text-muted">El Napicol, el periódico oficial de la LOD.</p>
      </div>

      <Status loading={league.loading} error={league.error} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Hemeroteca</h2>
        {prensaError && <p className="text-xs text-muted">{prensaError}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {todos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setAbierto(p)}
              className="rounded-xl bg-[#f5f0e4] p-4 text-left text-[#141414] shadow transition hover:-translate-y-0.5"
            >
              <p className="flex justify-between border-b border-[#141414] pb-1 text-[11px] uppercase tracking-wider">
                <span>{fechaCorta(p.fecha)}</span>
                <span>{p.dia_number ? `Día ${p.dia_number}` : "Especial"}</span>
              </p>
              <p className="mt-2 font-serif text-xl font-black leading-tight">EL NAPICOL</p>
              <p className="mt-1 font-bold leading-snug text-[#c8102e]">{p.titulo}</p>
              {i === 0 && <span className="mt-2 inline-block bg-[#ffd23f] px-2 py-0.5 text-[11px] font-bold uppercase">Último número</span>}
            </button>
          ))}
        </div>
      </section>

      <Redaccion league={league} juego={juego} anteriores={todos} onSubido={reload} />

      {abierto && (
        <Visor
          periodico={abierto}
          puedeBorrar={Boolean(session) && !abierto.src}
          onClose={() => setAbierto(null)}
          onBorrado={() => {
            setAbierto(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Visor({ periodico, puedeBorrar, onClose, onBorrado }: {
  periodico: Periodico;
  puedeBorrar: boolean;
  onClose: () => void;
  onBorrado: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (periodico.src) return;
    htmlDe(periodico).then(setHtml, (e) => setError(e.message ?? "No se pudo abrir"));
  }, [periodico]);

  function abrirFuera() {
    if (periodico.src) return window.open(periodico.src, "_blank");
    if (!html) return;
    window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
  }

  async function borrar() {
    if (!confirm(`¿Borrar "${periodico.titulo}"?`)) return;
    const { error } = await supabase.from("periodicos").delete().eq("id", periodico.id);
    if (error) setError(error.message);
    else onBorrado();
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-felt" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <p className="mr-auto truncate text-sm font-semibold">{periodico.titulo}</p>
        <button onClick={abrirFuera} className="rounded-full border border-line px-3 py-1 text-xs text-muted">Abrir aparte</button>
        {puedeBorrar && <button onClick={borrar} className="rounded-full border border-red/50 px-3 py-1 text-xs text-red">Borrar</button>}
        <button onClick={onClose} className="rounded-full bg-gold px-3 py-1 text-sm font-semibold text-felt">Cerrar</button>
      </div>
      {error ? (
        <p className="p-4 text-sm text-red">{error}</p>
      ) : periodico.src ? (
        <iframe src={periodico.src} title={periodico.titulo} sandbox="allow-scripts" className="w-full flex-1 bg-[#e7e0d0]" />
      ) : html ? (
        <iframe srcDoc={html} title={periodico.titulo} sandbox="allow-scripts" className="w-full flex-1 bg-[#e7e0d0]" />
      ) : (
        <p className="py-10 text-center text-muted">Imprimiendo…</p>
      )}
    </div>
  );
}

function Redaccion({ league, juego, anteriores, onSubido }: {
  league: ReturnType<typeof useLeague>;
  juego: ReturnType<typeof usePartidas>;
  anteriores: Periodico[];
  onSubido: () => void;
}) {
  const [fecha, setFecha] = useState("");
  const [hoy, setHoy] = useState("");
  const [now, setNow] = useState(0); // Date.now() no se puede evaluar al prerenderizar
  const [notas, setNotas] = useState("");
  const [conPlantilla, setConPlantilla] = useState(true);
  const [plantilla, setPlantilla] = useState<string | null>(null);
  const [verPrompt, setVerPrompt] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // gameToday() depende de la hora: solo en el navegador
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHoy(gameToday());
    setNow(Date.now());
    fetch(PLANTILLA).then((r) => r.text()).then(setPlantilla, () => setPlantilla(null));
  }, []);

  const resumenes = useMemo(
    () => resumir(juego.partidas, juego.jugadores, juego.movimientos, now, new Set(regularsOf(league.players).map((p) => p.id))),
    [juego.partidas, juego.jugadores, juego.movimientos, now, league.players],
  );

  // Días con algo que contar: jornadas registradas o partidas del modo juego
  const fechas = useMemo(() => {
    const s = new Set<string>();
    for (const j of league.jornadas) if (j.played_on) s.add(j.played_on);
    for (const r of resumenes) s.add(dayOf(r.partida.started_at));
    if (hoy) s.add(hoy);
    return [...s].sort().reverse();
  }, [league.jornadas, resumenes, hoy]);

  const elegida = fecha || fechas.find((f) => f !== hoy || resumenes.some((r) => dayOf(r.partida.started_at) === f)) || fechas[0] || "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (elegida) setNotas(leerNotas(elegida));
  }, [elegida]);

  const history = useMemo(
    () => leagueHistory(league.players, league.dias, league.jornadas, league.results, league.adjustments),
    [league.players, league.dias, league.jornadas, league.results, league.adjustments],
  );

  const prompt = useMemo(
    () =>
      elegida
        ? promptDelDia({
            fecha: elegida,
            players: league.players,
            jornadas: league.jornadas,
            results: league.results,
            adjustments: league.adjustments,
            events: league.events,
            history,
            partidas: resumenes.filter((r) => dayOf(r.partida.started_at) === elegida),
            totalJornadas: league.league?.total_jornadas ?? 200,
            anteriores: anteriores.filter((p) => p.fecha < elegida).slice(0, 6),
            notas,
            plantilla: conPlantilla ? plantilla : null,
          })
        : "",
    [elegida, league, history, resumenes, anteriores, notas, conPlantilla, plantilla],
  );

  function cambiarNotas(v: string) {
    setNotas(v);
    try {
      localStorage.setItem(notasKey(elegida), v);
    } catch {
      // sin almacenamiento: las notas solo viven mientras la página esté abierta
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(prompt);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const diaDe = (f: string) => league.dias.find((d) => d.played_on === f)?.number ?? null;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="text-lg font-semibold">✍️ Redacción</h2>
        <p className="text-sm text-muted">
          Elige el día, apunta lo que pasó en la mesa y copia el prompt. Pégalo en Claude, descarga el HTML que te dé y súbelo aquí abajo.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">Día de juego</span>
            <select value={elegida} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full">
              {fechas.map((f) => (
                <option key={f} value={f}>
                  {fechaCorta(f)}
                  {diaDe(f) ? ` · Día ${diaDe(f)}` : ""}
                  {f === hoy ? " (hoy)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Lo que pasó (chascarrillos, quejas, apodos nuevos, quién llegó tarde…)</span>
            <textarea
              value={notas}
              onChange={(e) => cambiarNotas(e.target.value)}
              rows={7}
              placeholder="Victimilla intentó comprar la partida con una ronda… Il Cazatore tardó 10 minutos en elegir color…"
              className="mt-1 w-full"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={conPlantilla} onChange={(e) => setConPlantilla(e.target.checked)} />
            Incluir el último número como plantilla de diseño
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={copiar} disabled={!prompt} className="rounded-full bg-gold px-4 py-2 font-semibold text-felt disabled:opacity-50">
              {copiado ? "¡Copiado!" : "📋 Copiar prompt"}
            </button>
            <button onClick={() => setVerPrompt((v) => !v)} className="rounded-full border border-line px-4 py-2 text-sm text-muted">
              {verPrompt ? "Ocultar" : "Ver prompt"}
            </button>
          </div>
        </div>

        <Subir fecha={elegida} diaDe={diaDe} onSubido={onSubido} />
      </div>

      {verPrompt && (
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-felt p-3 text-xs text-muted">
          {conPlantilla && plantilla ? prompt.split("\n## PLANTILLA")[0] + "\n\n## PLANTILLA … (HTML del último número)" : prompt}
        </pre>
      )}
    </section>
  );
}

function Subir({ fecha, diaDe, onSubido }: { fecha: string; diaDe: (f: string) => number | null; onSubido: () => void }) {
  const [archivo, setArchivo] = useState<{ html: string; titulo: string } | null>(null);
  const [titulo, setTitulo] = useState("");
  const [cuando, setCuando] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function elegir(f: File | undefined) {
    if (!f) return;
    const html = await f.text();
    const t = tituloDe(html, f.name.replace(/\.html?$/i, ""));
    setArchivo({ html, titulo: t });
    setTitulo(t);
    setEstado(null);
  }

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    const { error } = await supabase.from("periodicos").insert({
      titulo: titulo.trim() || archivo.titulo,
      fecha: cuando || fecha,
      dia_number: diaDe(cuando || fecha),
      html: archivo.html,
    });
    setSubiendo(false);
    if (error) {
      setEstado(error.message.includes("periodicos") ? "Falta la tabla: ejecuta supabase/11_prensa.sql" : error.message);
      return;
    }
    setArchivo(null);
    setTitulo("");
    setCuando("");
    setEstado("¡Publicado en la hemeroteca!");
    onSubido();
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line p-3">
      <p className="text-sm font-semibold">📤 Subir periódico</p>
      <input type="file" accept=".html,.htm,text/html" onChange={(e) => elegir(e.target.files?.[0])} className="w-full text-sm" />
      {archivo && (
        <>
          <label className="block text-sm">
            <span className="text-muted">Titular</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-1 w-full" />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Fecha</span>
            <input type="date" value={cuando || fecha} onChange={(e) => setCuando(e.target.value)} className="mt-1 w-full" />
          </label>
          <button onClick={subir} disabled={subiendo} className="rounded-full bg-gold px-4 py-2 font-semibold text-felt disabled:opacity-50">
            {subiendo ? "Subiendo…" : "Publicar"}
          </button>
        </>
      )}
      {estado && <p className="text-sm text-muted">{estado}</p>}
      <p className="text-xs text-muted">Ya están en la hemeroteca los {ARCHIVO.length} primeros números.</p>
    </div>
  );
}
