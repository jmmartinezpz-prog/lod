"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

// Pestañas abajo, al alcance del pulgar
const tabs = [
  { href: "/", label: "Liga", icon: "🏆" },
  { href: "/jornadas", label: "Jornadas", icon: "🎲" },
  { href: "/juego", label: "Juego", icon: "⚔️" },
  { href: "/estadisticas", label: "Stats", icon: "📊" },
];
const adminLinks = [
  { href: "/registrar", label: "+ Jornada" },
  { href: "/extras", label: "Extras" },
];

export default function Nav() {
  const path = usePathname();
  const { session } = useSession();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-felt/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Link href="/" className="mr-auto text-lg font-bold tracking-tight">
            🎲 <span className="text-gold">LOD</span>
          </Link>
          {session &&
            adminLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                  path === l.href ? "bg-gold font-semibold text-felt" : "text-muted"
                }`}
              >
                {l.label}
              </Link>
            ))}
          {session ? (
            <button onClick={() => supabase.auth.signOut()} className="px-2 text-xs text-muted">
              Salir
            </button>
          ) : (
            <Link href="/login" className="px-2 py-1.5 text-xs text-muted">
              Admin
            </Link>
          )}
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-felt/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {tabs.map((t) => {
            const on = path === t.href;
            return (
              <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 py-2 text-xs ${on ? "font-semibold text-gold" : "text-muted"}`}>
                <span className={`text-xl transition ${on ? "scale-110" : "opacity-70"}`}>{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
