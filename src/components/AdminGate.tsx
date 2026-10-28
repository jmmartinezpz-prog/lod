"use client";

import Link from "next/link";
import { useSession } from "@/lib/useSession";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useSession();
  if (!ready) return null;
  if (!session)
    return (
      <p className="py-10 text-center text-muted">
        Solo el admin puede registrar.{" "}
        <Link href="/login" className="text-gold underline">
          Entrar
        </Link>
      </p>
    );
  return <>{children}</>;
}
