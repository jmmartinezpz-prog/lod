"use client";

import { useEffect, useMemo, useState } from "react";
import { Status } from "@/components/Status";
import { leagueHistory, regularsOf } from "@/lib/history";
import { usePartidas } from "@/lib/partidas";
import { ARCHIVO, PLANTILLA, htmlDe, promptDelDia, tituloDe, usePeriodicos, type Periodico } from "@/lib/prensa";
import { dayOf, gameToday, resumir } from "@/lib/stats";
import { leerLlave, supabase } from "@/lib/supabase";
import { useLeague } from "@/lib/useLeague";
import { MeterLlave, QuienApunta } from "@/components/Llave";
import { usePermiso } from "@/lib/llave";

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

      <Redaccion
        league={league}
        juego={juego}
        anteriores={todos}
        onSubido={reload}
        onAbrir={(id) => setAbierto(todos.find((p) => p.id === id) ?? null)}
      />

      {abierto && (
        <Visor
          periodico={abierto}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}

function Visor({ periodico, onClose }: { periodico: Periodico; onClose: () => void }) {
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

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-felt" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <p className="mr-auto truncate text-sm font-semibold">{periodico.titulo}</p>
        <button onClick={abrirFuera} className="rounded-full border border-line px-3 py-1 text-xs text-muted">Abrir aparte</button>
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

// Los otros números del archivo, sin las fotos en base64, como referencia de tono y estilo
const sinFotos = (html: string) => html.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/gi, "data:,");

type Imprenta = { fase: "escribiendo" | "hecho" | "error"; kb: number; msg?: string; id?: string };

function Redaccion({ league, juego, anteriores, onSubido, onAbrir }: {
  league: ReturnType<typeof useLeague>;
  juego: ReturnType<typeof usePartidas>;
  anteriores: Periodico[];
  onSubido: () => void;
  onAbrir: (id: string) => void;
}) {
  const permiso = usePermiso();
  const [referencias, setReferencias] = useState<string[]>([]);
  const [imprenta, setImprenta] = useState<Imprenta | null>(null);
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
    Promise.all(ARCHIVO.filter((p) => p.src && p.src !== PLANTILLA).map((p) => fetch(p.src!).then((r) => r.text())))
      .then((h) => setReferencias(h.map(sinFotos)), () => setReferencias([]));
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

  // Datos del día; la plantilla se añade aparte (el botón de crear la lleva siempre)
  const datos = useMemo(
    () =>
      elegida
        ? {
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
          }
        : null,
    [elegida, league, history, resumenes, anteriores, notas],
  );
  const prompt = datos ? promptDelDia({ ...datos, plantilla: conPlantilla ? plantilla : null }) : "";

  function cambiarNotas(v: string) {
    setNotas(v);
    try {
      localStorage.setItem(notasKey(elegida), v);
    } catch {
      // sin almacenamiento: las notas solo viven mientras la página esté abierta
    }
  }

  // Claude escribe el número entero y el servidor lo guarda en la hemeroteca
  async function crear() {
    if (!datos || !plantilla || imprenta?.fase === "escribiendo") return;
    const completo = [
      promptDelDia({ ...datos, plantilla }),
      "\n## OTROS NÚMEROS DE EL NAPICOL (referencia de tono, secciones y running gags; el diseño, el de la plantilla)",
      ...referencias.map((h, i) => `\n### Número anterior ${i + 1}\n\`\`\`html\n${h}\n\`\`\``),
      "\n## ENCARGO\nEscribe el número de El Napicol de este día. Los comentarios de la mesa, si los hay, inclúyelos. Responde solo con el HTML completo.",
    ].join("\n");
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const llave = leerLlave();
    if (llave) headers["x-lod-llave"] = llave;
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;

    setImprenta({ fase: "escribiendo", kb: 0 });
    try {
      const res = await fetch("/api/periodico", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: completo, fecha: elegida, dia_number: diaDe(elegida) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let texto = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        texto += dec.decode(value, { stream: true });
        setImprenta({ fase: "escribiendo", kb: Math.round(texto.length / 1024) });
      }
      const ok = /<!--LOD-OK:([\w-]+)-->/.exec(texto);
      const ko = /<!--LOD-ERROR:([\s\S]*?)-->/.exec(texto);
      if (!ok) throw new Error(ko?.[1] ?? "Se cortó la conexión antes de terminar");
      setImprenta({ fase: "hecho", kb: Math.round(texto.length / 1024), id: ok[1] });
      onSubido();
    } catch (e) {
      setImprenta({ fase: "error", kb: 0, msg: (e as Error).message });
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
          Elige el día y dale al botón: El Napicol se escribe solo con los resultados, piscinas y clasificación de ese día, con la misma estética y el mismo tono que los números anteriores.
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
            <span className="text-muted">💬 Comentarios para el periódico (opcional): chascarrillos, quejas, apodos nuevos, quién llegó tarde…</span>
            <textarea
              value={notas}
              onChange={(e) => cambiarNotas(e.target.value)}
              rows={7}
              placeholder="Victimilla intentó comprar la partida con una ronda… Il Cazatore tardó 10 minutos en elegir color…"
              className="mt-1 w-full"
            />
          </label>
          <button
            onClick={crear}
            disabled={!prompt || !plantilla || !permiso.puede || imprenta?.fase === "escribiendo"}
            className="w-full rounded-2xl bg-gold py-3.5 text-lg font-bold text-felt disabled:opacity-50"
          >
            {imprenta?.fase === "escribiendo" ? "🗞️ Imprimiendo…" : "📰 Crear el periódico del día"}
          </button>
          {imprenta?.fase === "escribiendo" && (
            <p className="animate-pulse text-center text-sm text-muted">
              Las rotativas están en marcha ({imprenta.kb} KB). Tarda un par de minutos; no cierres esta pantalla.
            </p>
          )}
          {imprenta?.fase === "hecho" && imprenta.id && (
            <div className="space-y-2 rounded-xl border border-gold/60 bg-gold/10 p-3 text-center">
              <p className="font-semibold">¡Número publicado en la hemeroteca!</p>
              <button onClick={() => onAbrir(imprenta.id!)} className="rounded-full bg-gold px-4 py-1.5 font-semibold text-felt">Leerlo</button>
            </div>
          )}
          {imprenta?.fase === "error" && (
            <p className="rounded-xl border border-red/60 p-3 text-center text-sm text-red">No ha salido: {imprenta.msg}. Prueba otra vez.</p>
          )}
        </div>

        <details className="rounded-xl border border-dashed border-line p-3 text-sm">
          <summary className="cursor-pointer text-muted">A mano: copiar el prompt o subir un HTML</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={conPlantilla} onChange={(e) => setConPlantilla(e.target.checked)} />
              Incluir el último número como plantilla de diseño
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={copiar} disabled={!prompt} className="rounded-full border border-line px-4 py-2 font-semibold text-ink disabled:opacity-50">
                {copiado ? "¡Copiado!" : "📋 Copiar prompt"}
              </button>
              <button onClick={() => setVerPrompt((v) => !v)} className="rounded-full border border-line px-4 py-2 text-sm text-muted">
                {verPrompt ? "Ocultar" : "Ver prompt"}
              </button>
            </div>
            <Subir fecha={elegida} diaDe={diaDe} onSubido={onSubido} />
          </div>
        </details>
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
  const permiso = usePermiso();

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
      <MeterLlave permiso={permiso} que="subir periódicos" />
      <QuienApunta permiso={permiso} />
      <input type="file" disabled={!permiso.puede} accept=".html,.htm,text/html" onChange={(e) => elegir(e.target.files?.[0])} className="w-full text-sm" />
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
