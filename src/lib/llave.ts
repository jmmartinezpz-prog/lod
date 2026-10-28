"use client";

import { useCallback, useEffect, useState } from "react";
import { LLAVE_KEY, supabase, supabaseConfigured } from "./supabase";

export type Permiso = {
  cargando: boolean;
  puede: boolean; // puede apuntar partidas, subir periódicos, anular…
  nombre: string | null; // de quién es la llave de este móvil
  admin: boolean;
  sinSistema: boolean; // aún no se ha ejecutado 12_seguridad.sql: todo sigue abierto
};

const EVENTO = "lod-llave";

export function guardarLlave(code: string | null) {
  try {
    if (code) localStorage.setItem(LLAVE_KEY, code.trim().toUpperCase());
    else localStorage.removeItem(LLAVE_KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENTO));
}

export function usePermiso(): Permiso & { recargar: () => void } {
  const [p, setP] = useState<Permiso>({ cargando: true, puede: false, nombre: null, admin: false, sinSistema: false });

  const recargar = useCallback(async () => {
    if (!supabaseConfigured) return setP({ cargando: false, puede: false, nombre: null, admin: false, sinSistema: true });
    const { data, error } = await supabase.rpc("quien_soy");
    if (error) return setP({ cargando: false, puede: true, nombre: null, admin: false, sinSistema: true });
    const d = data as { admin: boolean; llave: string | null };
    setP({ cargando: false, puede: d.admin || Boolean(d.llave), nombre: d.llave, admin: d.admin, sinSistema: false });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recargar();
    window.addEventListener(EVENTO, recargar);
    const { data } = supabase.auth.onAuthStateChange(() => recargar());
    return () => {
      window.removeEventListener(EVENTO, recargar);
      data.subscription.unsubscribe();
    };
  }, [recargar]);

  return { ...p, recargar };
}
