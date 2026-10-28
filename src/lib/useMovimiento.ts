"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Movimiento en la clasificación: se compara con lo que se vio la última vez en este móvil
// (o con lo de hace un momento, si cambia estando en la pantalla). Primero se ve como estaba,
// luego cada uno se desliza a su sitio nuevo y los puntos suben de contador.
type Foto = { orden: string[]; puntos: Record<string, number> };
export type Cambio = { puestos: number; puntos: number };

const KEY = "lod-clasificacion-vista";
const ESPERA = 700; // lo que se ve el orden de antes
const DESLIZ = 900;
const CONTADOR = 1400;

function leer(): Foto | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
function guardar(f: Foto) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {}
}

export function useMovimiento(rows: { id: string; points: number }[], listo: boolean) {
  const [antes, setAntes] = useState<Foto | null>(null);
  const [cuenta, setCuenta] = useState<Record<string, number> | null>(null);
  const [cambios, setCambios] = useState<Record<string, Cambio>>({});
  const visto = useRef<Foto | null | undefined>(undefined);
  const nodos = useRef(new Map<string, HTMLElement>());
  const rects = useRef<Map<string, number> | null>(null);
  const firma = rows.map((r) => `${r.id}:${r.points}`).join(",");

  useEffect(() => {
    if (!listo || !rows.length) return;
    const ahora: Foto = { orden: rows.map((r) => r.id), puntos: Object.fromEntries(rows.map((r) => [r.id, r.points])) };
    if (visto.current === undefined) visto.current = leer();
    const prev = visto.current;
    const marcarVisto = () => {
      visto.current = ahora;
      guardar(ahora);
    };
    if (!prev || prev.orden.join() + JSON.stringify(prev.puntos) === ahora.orden.join() + JSON.stringify(ahora.puntos)) {
      marcarVisto();
      return;
    }

    const nuevos: Record<string, Cambio> = {};
    for (const id of ahora.orden) {
      const i = prev.orden.indexOf(id);
      if (i < 0 || !(id in prev.puntos)) continue;
      const c = { puestos: i - ahora.orden.indexOf(id), puntos: ahora.puntos[id] - prev.puntos[id] };
      if (c.puestos || c.puntos) nuevos[id] = c;
    }
    setAntes(prev);
    setCuenta(prev.puntos);

    let raf = 0;
    // Solo cuenta como visto cuando de verdad se ha enseñado el movimiento
    const t = setTimeout(() => {
      marcarVisto();
      rects.current = new Map([...nodos.current].map(([id, el]) => [id, el.getBoundingClientRect().top]));
      setAntes(null);
      setCambios(nuevos);
      const t0 = performance.now();
      const paso = (t: number) => {
        const k = Math.min(1, (t - t0) / CONTADOR);
        const e = 1 - (1 - k) ** 3;
        setCuenta(Object.fromEntries(ahora.orden.map((id) => {
          const de = prev.puntos[id] ?? ahora.puntos[id];
          return [id, Math.round(de + (ahora.puntos[id] - de) * e)];
        })));
        if (k < 1) raf = requestAnimationFrame(paso);
        else setCuenta(null);
      };
      raf = requestAnimationFrame(paso);
    }, ESPERA);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, listo]);

  // FLIP: cada fila sale de donde estaba y se desliza a su puesto nuevo
  useLayoutEffect(() => {
    const viejos = rects.current;
    if (antes || !viejos) return;
    rects.current = null;
    for (const [id, el] of nodos.current) {
      const dy = (viejos.get(id) ?? 0) - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: DESLIZ, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }, [antes]);

  const ref = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodos.current.set(id, el);
      else nodos.current.delete(id);
    },
    [],
  );

  return {
    // Mientras se enseña "cómo estaba", el orden de antes
    ordenar: <T,>(xs: T[], id: (x: T) => string) =>
      antes ? xs.toSorted((a, b) => (antes.orden.indexOf(id(a)) + 1 || 999) - (antes.orden.indexOf(id(b)) + 1 || 999)) : xs,
    puntos: (id: string, real: number) => cuenta?.[id] ?? real,
    cambio: (id: string) => (antes ? undefined : cambios[id]),
    ref,
  };
}
