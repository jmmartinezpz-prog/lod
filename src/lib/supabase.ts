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
