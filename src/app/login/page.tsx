"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePermiso } from "@/lib/llave";
import { MeterLlave, QuienApunta } from "@/components/Llave";

export default function Login() {
  const router = useRouter();
  const permiso = usePermiso();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/registrar");
  }

  return (
    <div className="mx-auto max-w-sm space-y-8 pt-6">
      <MeterLlave
        permiso={permiso}
        que="apuntar jornadas, partidas y periódicos"
      />
      {permiso.puede && !permiso.cargando && (
        <div className="space-y-2 rounded-2xl border border-line bg-card p-4 text-center">
          <QuienApunta permiso={permiso} />
          <Link
            href="/"
            className="inline-block rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-felt"
          >
            Ir a la liga
          </Link>
        </div>
      )}
      {!permiso.admin && (
        <form onSubmit={submit} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">
            Acceso admin (solo Super Sapiens)
          </h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-gold py-2 font-bold text-felt disabled:opacity-50"
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      )}
    </div>
  );
}
