"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/registrar");
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 pt-10">
      <h1 className="text-2xl font-black">Acceso admin</h1>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-gold py-2 font-bold text-felt disabled:opacity-50">
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
