import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

// La llave de este móvil (12_seguridad.sql) viaja en cada petición: sin ella solo se puede leer
export const LLAVE_KEY = "lod-llave";
export function leerLlave(): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(LLAVE_KEY);
  } catch {
    return null;
  }
}

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder",
  {
    global: {
      fetch: (input, init) => {
        const llave = leerLlave();
        if (!llave) return fetch(input, init);
        const headers = new Headers(init?.headers);
        headers.set("x-lod-llave", llave);
        return fetch(input, { ...init, headers });
      },
    },
  },
);

// Leer también exige llave (14_solo_con_llave.sql), pero el tiempo real no la lleva.
// Así que se escucha la tabla pública "cambios" (solo dice qué tabla ha cambiado)
// y quien la escucha recarga por la API normal, que sí lleva la llave.
export function escucharCambios(nombre: string, tablas: string[], alCambiar: () => void) {
  const channel = supabase
    .channel(nombre)
    .on("postgres_changes", { event: "*", schema: "public", table: "cambios" }, (p) => {
      const tabla = (p.new as { tabla?: string } | null)?.tabla;
      if (tabla && tablas.includes(tabla)) alCambiar();
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
