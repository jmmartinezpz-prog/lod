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
  { href: "/prensa", label: "Prensa", icon: "📰" },
];
const adminLinks = [
  { href: "/registrar", label: "+ Jornada" },
  { href: "/extras", label: "Extras" },
  { href: "/seguridad", label: "🛡" },
];

export default function Nav() {
  const path = usePathname();
  const { session } = useSession();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-felt/90 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
          {/* Wheely Fog patrocina la LOD */}
          <Link href="/" className="mr-auto flex items-center gap-2 text-lg font-bold tracking-tight">
            <span>
              🎲 <span className="text-gold">LOD</span>
            </span>
            <span className="text-xs font-normal text-muted">×</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wheely-fog.png" alt="Wheely Fog" width={480} height={226} className="h-7 w-auto" />
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
        <div className="mx-auto grid max-w-xl grid-cols-5">
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
