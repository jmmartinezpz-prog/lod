"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/", label: "Clasificación" },
  { href: "/jornadas", label: "Jornadas" },
  { href: "/juego", label: "Juego" },
];
const adminLinks = [
  { href: "/registrar", label: "+ Jornada" },
  { href: "/extras", label: "Extras" },
];

export default function Nav() {
  const path = usePathname();
  const { session } = useSession();
  const all = session ? [...links, ...adminLinks] : links;

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-felt/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link href="/" className="mr-auto font-black tracking-tight">
          🎲 <span className="text-gold">LOD</span>
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {all.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 ${
                path === l.href ? "bg-gold text-felt font-semibold" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {session ? (
            <button onClick={() => supabase.auth.signOut()} className="px-2 text-xs text-muted hover:text-ink">
              Salir
            </button>
          ) : (
            <Link href="/login" className="px-2 py-1.5 text-xs text-muted hover:text-ink">
              Admin
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
