"use client";

import Link from "next/link";
import { usePermiso } from "@/lib/llave";
import { MeterLlave } from "@/components/Llave";

// Con llave se apunta todo; soloAdmin deja fuera a las llaves (panel 🛡)
export default function AdminGate({ children, soloAdmin = false }: { children: React.ReactNode; soloAdmin?: boolean }) {
  const permiso = usePermiso();
  if (permiso.cargando) return null;
  if (soloAdmin ? permiso.admin || permiso.sinSistema : permiso.puede) return <>{children}</>;
  if (soloAdmin)
    return (
      <p className="py-10 text-center text-muted">
        Solo el admin.{" "}
        <Link href="/login" className="text-gold underline">
          Entrar
        </Link>
      </p>
    );
  return (
    <div className="mx-auto max-w-md py-6">
      <MeterLlave permiso={permiso} que="apuntar" />
    </div>
  );
}
