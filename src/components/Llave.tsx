"use client";

import { useState } from "react";
import { guardarLlave, type Permiso } from "@/lib/llave";

// Aviso + campo para meter la llave en este móvil (solo se ve si no puede apuntar)
export function MeterLlave({ permiso, que }: { permiso: Permiso; que: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  if (permiso.cargando || permiso.puede) return null;

  async function probar() {
    guardarLlave(code);
    setError(false);
    // El hook se recarga solo; si la llave no vale seguirá sin poder
    setTimeout(() => setError(true), 1500);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-gold/60 bg-gold/10 p-4">
      <p className="font-semibold">🔑 Mete tu llave</p>
      <p className="text-sm text-muted">Para {que} hace falta tu llave. Pídesela al admin; solo hay que meterla una vez y da igual mayúsculas o guiones.</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && code.trim() && probar()}
          placeholder="LOD-XXXX-XXXX"
          autoCapitalize="characters"
          className="font-mono"
        />
        <button onClick={probar} disabled={!code.trim()} className="whitespace-nowrap rounded-lg bg-gold px-4 font-semibold text-felt disabled:opacity-40">
          Entrar
        </button>
      </div>
      {error && <p className="text-sm text-red">Esa llave no vale o está revocada.</p>}
    </div>
  );
}

// Quién está apuntando desde este móvil
export function QuienApunta({ permiso }: { permiso: Permiso }) {
  if (permiso.sinSistema || !permiso.puede) return null;
  return (
    <p className="text-xs text-muted">
      {permiso.admin ? "🛡 Apuntando como admin" : `🔑 Apuntando como ${permiso.nombre}`}
      {permiso.nombre && (
        <button onClick={() => confirm("¿Quitar la llave de este móvil?") && guardarLlave(null)} className="ml-2 underline">
          quitar
        </button>
      )}
    </p>
  );
}
