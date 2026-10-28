"use client";

import { useCallback, useEffect, useState } from "react";
import { escucharCambios, supabase, supabaseConfigured } from "./supabase";
import type { LeagueHistory } from "./history";
import type { Resumen } from "./stats";
import type { Adjustment, Jornada, LeagueEvent, Player, Result } from "./types";

// Un periódico de El Napicol: los primeros van dentro de la app, el resto se suben a Supabase
export type Periodico = {
  id: string;
  titulo: string;
  fecha: string; // yyyy-mm-dd
  dia_number: number | null;
  src?: string; // archivo estático en /public
};

export const ARCHIVO: Periodico[] = [
  { id: "a-guerritas", titulo: "¡El Guerritas lo seca todo!", fecha: "2026-10-06", dia_number: 3, src: "/napicol/2026-10-06-guerritas-cumpleanos.html" },
  { id: "a-puchades", titulo: "Exclusiva: ¡Victimilla es Puchades!", fecha: "2026-10-08", dia_number: null, src: "/napicol/2026-10-08-victimilla-puchades.html" },
  { id: "a-arrasa", titulo: "¡Victimilla arrasa!", fecha: "2026-10-22", dia_number: 6, src: "/napicol/2026-10-22-victimilla-arrasa.html" },
  { id: "a-lutero", titulo: "¡Martín Lutero reforma la Liga!", fecha: "2026-10-28", dia_number: 7, src: "/napicol/2026-10-28-lutero-reforma.html" },
];
// El último número sin fotos sirve de plantilla de estilo para el prompt
export const PLANTILLA = "/napicol/2026-10-28-lutero-reforma.html";

export function usePeriodicos() {
  const [subidos, setSubidos] = useState<Periodico[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data, error } = await supabase.from("periodicos").select("id, titulo, fecha, dia_number").order("fecha", { ascending: false });
    setError(error ? "Falta la tabla de prensa: ejecuta supabase/11_prensa.sql" : null);
    setSubidos(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!supabaseConfigured) return;
    return escucharCambios("lod-prensa", ["periodicos"], load);
  }, [load]);

  const todos = [...subidos, ...ARCHIVO].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { todos, error, reload: load };
}

export async function htmlDe(p: Periodico): Promise<string> {
  if (p.src) return (await fetch(p.src)).text();
  const { data, error } = await supabase.from("periodicos").select("html").eq("id", p.id).single();
  if (error) throw error;
  return data.html as string;
}

export { tituloDe } from "./titulo";

// ---------- Prompt del día ----------

const DEADLINE = "2026-11-01"; // fin del periodo de gracia del novato, la cuenta atrás de todos los números

const PERSONAJES = `- Super Sapiens 👑✝️ — "el Ministro", alias Martín Lutero (el de las 95 tesis). Campeón del mundo vigente (1 estrella). Se cree humanamente superior. Juega "de luto" (✝️) desde que lo secaron.
- Il Cazatore — "el Moñigas" / "Moñigas Supremo". Juega a no mojarse: espera, no arriesga y sobrevive mientras los demás se eliminan. "Gana por Moñigas o no gana". Se moñiga hasta al elegir el color del marcador.
- Anitín Poceiro ✝️ — el funcionario de la LOD. Callado, constante, paciente; también de luto. Peligroso cuando nadie le mira.
- Adolf Victimilla ★★ — dos mundiales. Victimista profesional: se queja gane o pierda, reclama viejas glorias, negocia y "chantajea" en la mesa. Rumor: pariente de Puchades (leyenda del Valencia).
- El Judío Supremo — el novato. Farolillo rojo, le cuesta arrancar la moto, bacalea, lleva las gafas colgadas del cuello y no ve ni con ojo de halcón. Su periodo de gracia acaba el 1 de noviembre. Entró en la J13 con 15 puntos de alta (16 tras su primera jornada), a 10 de Super Sapiens, que esa jornada iba último de los veteranos: por eso Super Sapiens nunca ha sido farolillo rojo.
- Wildcards: invitados puntuales (p. ej. Guerritas Maduro, "seca todo lo que hay a su alrededor").
- Lugar: el bar Rui. Destino final: Napicol 2027. Reglas de la casa: la Regla de los Tres, las piscinas, la vida cero y el BUST.`;

const ESTILO = `- Periódico satírico en castellano de España, tono de prensa deportiva exagerada y cariñosa: épico, irónico, con motes y running gags. Se puede vacilar a todos, sin insultos de verdad.
- Los datos (resultados, puntos, piscinas, clasificación) son sagrados: úsalos tal cual y no inventes ninguno. Las anécdotas, citas y "fuentes del Rui" sí se pueden novelar a partir de las notas.
- Formato: UNA página HTML autocontenida (sin dependencias salvo Google Fonts), ancho fijo 1080px con el script de autoescalado para móvil, igual que la plantilla: misma cabecera "EL NAPICOL" con los dados, mismos colores (#f5f0e4 papel, #141414 tinta, #c8102e rojo, #ffd23f amarillo) y tipografías (Playfair Display, Anton, Source Serif 4).
- Estructura típica: barra superior (fecha · jornadas · precio gracioso) → cabecera → franja de etiquetas → antetítulo + titular gigante + entradilla → bloque protagonista (marcador líder vs 2º, MVP, o foto) → clasificación general + resultados/piscinómetro → crónica a dos columnas con una cita destacada → recuadro de escándalo o paradoja del día → "Notas de vestuario" (una ficha por jugador) → cierre en negro con la pregunta final → pie.
- Si te paso fotos, inclúyelas embebidas en base64 dentro del HTML.
- Devuelve el archivo .html completo listo para descargar.`;

type DiaData = {
  fecha: string;
  players: Player[];
  jornadas: Jornada[]; // todas
  results: Result[];
  adjustments: Adjustment[];
  events: LeagueEvent[];
  history: LeagueHistory;
  partidas: Resumen[]; // del modo juego, ya filtradas a ese día
  totalJornadas: number;
  anteriores: Periodico[];
  notas: string;
  plantilla: string | null;
};

const fechaLarga = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// La numeración "SobN" de los periódicos no sale limpia de los datos: mejor no inventarla
export const etiquetaJornada = (j: Jornada) => `J${j.number}${j.kind === "sobrante" ? " (sobrantes)" : ""}`;

export function promptDelDia(d: DiaData): string {
  const name = (id: string | null) => {
    const p = d.players.find((x) => x.id === id);
    return p ? `${p.emoji ? `${p.emoji} ` : ""}${p.nickname}` : "¿?";
  };
  const delDia = d.jornadas.filter((j) => j.played_on === d.fecha).toSorted((a, b) => a.number - b.number);
  const ids = new Set(delDia.map((j) => j.id));
  const out: string[] = [];

  out.push(
    `Eres el redactor jefe de EL NAPICOL, el periódico oficial de la LOD (Liga de póker de dados · Road to Napicol 2027). Escribe el número de la jornada del ${fechaLarga(d.fecha)} con todo lo que pasó, en el mismo estilo que los números anteriores.`,
  );

  out.push(`\n## LOS PERSONAJES\n${PERSONAJES}`);
  out.push(`\n## ESTILO Y FORMATO\n${ESTILO}`);

  // Situación de la liga
  const jugadas = d.jornadas.length;
  const faltan = Math.round((Date.parse(`${DEADLINE}T12:00:00`) - Date.parse(`${d.fecha}T12:00:00`)) / 86_400_000);
  out.push(
    `\n## SITUACIÓN\n- Jornadas jugadas: ${jugadas} de ${d.totalJornadas} (${Math.round((jugadas / d.totalJornadas) * 100)}%).` +
      (faltan > 0 ? `\n- Faltan ${faltan} días para el 1 de noviembre (deadline del periodo de gracia).` : ""),
  );

  // Partidas del día (liga)
  if (delDia.length) {
    const lineas = delDia.map((j) => {
      const rs = d.results.filter((r) => r.jornada_id === j.id).toSorted((a, b) => a.position - b.position);
      const txt = rs.map((r) => `${r.position}º ${name(r.player_id)} (+${r.points})`).join(", ");
      return `- ${etiquetaJornada(j)}: ${txt || "sin resultados"}${j.notes ? ` — nota: ${j.notes}` : ""}`;
    });
    out.push(`\n## RESULTADOS DEL DÍA (${delDia.length} partidas)\n${lineas.join("\n")}`);

    const victorias = new Map<string, number>();
    for (const j of delDia) {
      const w = d.results.find((r) => r.jornada_id === j.id && r.position === 1);
      if (w) victorias.set(w.player_id, (victorias.get(w.player_id) ?? 0) + 1);
    }
    if (victorias.size)
      out.push(`Victorias del día: ${[...victorias].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${name(id)} ${n}`).join(" · ")}`);
  } else {
    out.push(`\n## RESULTADOS DEL DÍA\nAún no hay jornadas registradas con esta fecha en la clasificación.`);
  }

  // Clasificación antes y después
  const snaps = d.history.snapshots;
  const lastIdx = snaps.findLastIndex((s, i) => i > 0 && s.day === d.fecha);
  if (lastIdx > 0) {
    const firstIdx = snaps.findIndex((s, i) => i > 0 && s.day === d.fecha);
    const antes = snaps[firstIdx - 1];
    const despues = snaps[lastIdx];
    const orden = d.history.series.toSorted((a, b) => despues.totals[b.key] - despues.totals[a.key]);
    const lider = orden[0];
    const filas = orden.map((s, i) => {
      const delta = despues.totals[s.key] - antes.totals[s.key];
      const prev = antes.ranks[s.key];
      const now = despues.ranks[s.key];
      const mov = prev && now && prev !== now ? ` (antes ${prev}º)` : "";
      const dist = i ? ` · a ${despues.totals[lider.key] - despues.totals[s.key]} del líder` : "";
      return `${i + 1}º ${name(s.key)} — ${despues.totals[s.key]} pts (${delta >= 0 ? "+" : ""}${delta} hoy)${mov}${dist}`;
    });
    out.push(`\n## CLASIFICACIÓN GENERAL TRAS EL DÍA\n${filas.join("\n")}`);
    const lidAntes = antes.leaders.map(name).join(" y ");
    const lidAhora = despues.leaders.map(name).join(" y ");
    out.push(
      antes.leaders.join() === despues.leaders.join()
        ? `- Líder: ${lidAhora} (ya lo era al empezar el día).`
        : `- CAMBIO DE LÍDER: empezó el día ${lidAntes || "nadie"} y acaba ${lidAhora}.`,
    );
    if (despues.lasts.length) out.push(`- Farolillo rojo: ${despues.lasts.map(name).join(" y ")}.`);
    const lid = d.history.leadership.get(lider.key);
    if (lid) out.push(`- ${name(lider.key)} lleva ${lid.jornadasLider} jornadas como líder en total${lid.liderDesde ? ` (líder desde la J${lid.liderDesde})` : ""}.`);
  }

  // Piscinas y demás eventos de la liga
  const ev = d.events.filter((e) => (e.jornada_id ? ids.has(e.jornada_id) : false));
  const jLabel = (id: string | null) => {
    const j = delDia.find((x) => x.id === id);
    return j ? ` en ${etiquetaJornada(j)}` : "";
  };
  const pis = ev.filter((e) => e.kind === "piscina");
  if (pis.length)
    out.push(`\n## PISCINAS (liga)\n${pis.map((e) => `- ${name(e.player_id)} → ${name(e.target_player_id)}${e.value > 1 ? ` ×${e.value}` : ""}${jLabel(e.jornada_id)}${e.description ? ` (${e.description})` : ""}`).join("\n")}`);
  const otros = ev.filter((e) => e.kind !== "piscina");
  if (otros.length)
    out.push(`\n## OTROS EVENTOS\n${otros.map((e) => `- ${e.kind === "autopiscina" ? "Autopiscina" : "Punto de historia"}: ${name(e.player_id)}${jLabel(e.jornada_id)}${e.description ? ` (${e.description})` : ""}`).join("\n")}`);

  const sanc = d.adjustments.filter((a) => a.jornada_id && ids.has(a.jornada_id));
  if (sanc.length)
    out.push(`\n## SANCIONES Y AJUSTES\n${sanc.map((a) => `- ${name(a.player_id)}: ${a.points > 0 ? "+" : ""}${a.points} pts${jLabel(a.jornada_id)}${a.reason ? ` — ${a.reason}` : ""}`).join("\n")}`);

  // Modo juego: vidas, piscinas y orden de eliminación
  if (d.partidas.length) {
    const seatName = (s: { name: string; player_id: string | null }) => (s.player_id ? name(s.player_id) : `${s.name} (wildcard)`);
    const bloques = d.partidas.map((r, i) => {
      const tipo = r.partida.kind === "sobrante" ? "sobrantes" : "normal";
      const puestos = r.seats.map((s) => `${s.place}º ${seatName(s)}`).join(", ");
      const byId = new Map(r.seats.map((s) => [s.id, s]));
      const tiros = r.moves
        .filter((m) => m.kind === "piscina" && m.from_jugador_id)
        .map((m) => `${seatName(byId.get(m.from_jugador_id!)!)} → ${seatName(byId.get(m.jugador_id)!)}`);
      const cero = r.seats.filter((s) => s.minLives === 0).map(seatName);
      const bust = r.seats.filter((s) => s.moves.some((m) => m.lives_after < 0)).map(seatName);
      return [
        `- Partida ${i + 1} (${tipo}, ${r.partida.start_lives} vidas${r.live ? ", en juego" : ""}): ${puestos}`,
        tiros.length ? `  · Piscinas: ${tiros.join("; ")}` : "",
        cero.length ? `  · Llegaron a vida cero: ${cero.join(", ")}` : "",
        bust.length ? `  · BUST: ${bust.join(", ")}` : "",
      ].filter(Boolean).join("\n");
    });
    out.push(`\n## DETALLE DEL MODO JUEGO (marcador de la app)\n${bloques.join("\n")}`);
  }

  if (d.anteriores.length)
    out.push(`\n## NÚMEROS ANTERIORES (para mantener los running gags)\n${d.anteriores.map((p) => `- ${p.fecha}: ${p.titulo}`).join("\n")}`);

  out.push(`\n## LO QUE PASÓ EN LA MESA (notas de Vilanova)\n${d.notas.trim() || "(sin notas: tira de los datos y de los personajes)"}`);

  if (d.plantilla) out.push(`\n## PLANTILLA (último número, cópiale el diseño)\n\`\`\`html\n${d.plantilla}\n\`\`\``);

  return out.join("\n");
}
