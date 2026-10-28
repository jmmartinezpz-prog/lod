"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermiso } from "@/lib/llave";
import { MeterLlave } from "@/components/Llave";

// Sin llave (ni cuenta de admin) no se ve nada: solo la pantalla de entrada
export default function Puerta({ children }: { children: React.ReactNode }) {
  const permiso = usePermiso();
  const path = usePathname();
  if (permiso.puede || path === "/login") return <>{children}</>;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10" style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}>
      <div className="flex items-center gap-3 text-3xl font-bold">
        <span>
          🎲 <span className="text-gold">LOD</span>
        </span>
        <span className="text-base font-normal text-muted">×</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wheely-fog.png" alt="Wheely Fog" width={480} height={226} className="h-10 w-auto" />
      </div>
      <p className="text-sm text-muted">Road to Napicol 2027</p>
      {permiso.cargando ? (
        <p className="animate-pulse text-muted">Cargando…</p>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          <MeterLlave permiso={permiso} que="entrar" />
          <p className="text-center text-xs text-muted">
            <Link href="/login" className="underline">Acceso admin</Link>
          </p>
        </div>
      )}
    </main>
  );
}
