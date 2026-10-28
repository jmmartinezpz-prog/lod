"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Status } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";
import { newGame, PALETTE as COLORS, syncGame, uuid, type Game } from "@/lib/partidas";

const PRESETS = [10, 20, 30, 40];
const STORAGE_KEY = "lod-juego";

type Update = (fn: (g: Game | null) => Game | null) => void;

const tileBg = (color: string) =>
  `radial-gradient(circle at 30% 20%, color-mix(in srgb, ${color} 85%, white), ${color} 45%, color-mix(in srgb, ${color} 60%, black))`;

export default function Juego() {
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      // Las partidas de versiones anteriores (sin id) no se pueden guardar en las estadísticas
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.id && saved.pending) setGame(saved);
    } catch {}
  }, []);

  const update = useCallback<Update>((fn) => {
    setGame((cur) => {
      const next = fn(cur);
      try {
        if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return next;
    });
  }, []);

  return game ? <Board game={game} update={update} /> : <Setup onStart={(g) => update(() => g)} />;
}

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const { players, loading, error } = useLeague();
  const [start, setStart] = useState(20);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [colorOf, setColorOf] = useState<Record<string, string>>({});
  const [wildcards, setWildcards] = useState<{ id: string; name: string }[]>([]);
  const [wildName, setWildName] = useState("");

  if (loading || error) return <Status loading={loading} error={error} />;

  const regulars = players
    .filter((p) => p.active && !p.is_wildcard)
    .sort((a, b) => (a.seat_order ?? 99) - (b.seat_order ?? 99) || a.nickname.localeCompare(b.nickname))
    .map((p) => ({ id: p.id, name: `${p.emoji ? `${p.emoji} ` : ""}${p.nickname}` }));
  const candidates = [...regulars, ...wildcards];
  const color = (id: string) => colorOf[id] ?? COLORS[candidates.findIndex((c) => c.id === id) % COLORS.length];
  const seated = candidates.filter((c) => !excluded.has(c.id));

  function toggle(id: string) {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cycleColor(id: string) {
    setColorOf((cur) => ({ ...cur, [id]: COLORS[(COLORS.indexOf(color(id)) + 1) % COLORS.length] }));
  }

  function addWildcard() {
    const name = wildName.trim();
    if (!name) return;
    setWildcards((cur) => [...cur, { id: `wc-${Date.now()}`, name: `🃏 ${name}` }]);
    setWildName("");
  }

  function begin() {
    onStart(
      newGame(
        start,
        seated.map((c) => ({ playerId: c.id.startsWith("wc-") ? null : c.id, name: c.name, color: color(c.id) })),
      ),
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-black">⚔️ Modo juego</h1>
        <p className="text-sm text-muted">Elige vidas y jugadores, y a jugar</p>
      </div>

      <section className="rounded-2xl border border-line bg-card p-5 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Vidas iniciales</p>
        <div className="flex items-center justify-center gap-5">
          <button onClick={() => setStart((v) => Math.max(1, v - 1))} className="h-14 w-14 rounded-full border border-line text-3xl active:scale-95">−</button>
          <div className="min-w-28">
            <span className="tabular text-6xl font-black text-gold">{start}</span>
            <span className="ml-1 text-3xl">❤️</span>
          </div>
          <button onClick={() => setStart((v) => v + 1)} className="h-14 w-14 rounded-full border border-line text-3xl active:scale-95">+</button>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {PRESETS.map((v) => (
            <button
              key={v}
              onClick={() => setStart(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold ${start === v ? "bg-gold text-felt" : "border border-line text-muted"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Jugadores · toca para quitar, 🎨 para cambiar color
        </p>
        <div className="grid grid-cols-2 gap-3">
          {candidates.map((c) => {
            const on = !excluded.has(c.id);
            const isWild = c.id.startsWith("wc-");
            return (
              <div
                key={c.id}
                className={`relative h-24 overflow-hidden rounded-2xl shadow-lg transition ${on ? "" : "opacity-30 grayscale"}`}
                style={{ background: tileBg(color(c.id)) }}
              >
                <button onClick={() => toggle(c.id)} className="flex h-full w-full items-end p-3 text-left">
                  <span className="truncate text-lg font-black text-white [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">{c.name}</span>
                </button>
                <button
                  onClick={() => cycleColor(c.id)}
                  aria-label="Cambiar color"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-sm"
                >
                  🎨
                </button>
                {isWild && (
                  <button
                    onClick={() => setWildcards((cur) => cur.filter((w) => w.id !== c.id))}
                    aria-label="Quitar wildcard"
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-sm text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            placeholder="Nombre del wildcard"
            value={wildName}
            onChange={(e) => setWildName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWildcard()}
          />
          <button
            onClick={addWildcard}
            disabled={!wildName.trim()}
            className="whitespace-nowrap rounded-lg border border-gold px-4 font-bold text-gold disabled:opacity-40"
          >
            🃏 Añadir wildcard
          </button>
        </div>
      </section>

      <button
        onClick={begin}
        disabled={seated.length < 2}
        className="w-full rounded-2xl bg-gold py-4 text-lg font-black text-felt shadow-lg active:scale-[.99] disabled:opacity-40"
      >
        ¡Empezar! · {seated.length} jugadores
      </button>
    </div>
  );
}

function Board({ game, update }: { game: Game; update: Update }) {
  const rows = useRows(game.seats.length);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sync = useSync(game, update);
  useWakeLock();

  function add(id: string, delta: number) {
    const seat = game.seats.find((s) => s.id === id)!;
    const lives = Math.max(0, seat.lives + delta);
    if (lives === seat.lives) return;
    update((g) =>
      g && {
        ...g,
        seats: g.seats.map((s) => (s.id === id ? { ...s, lives } : s)),
        pending: [
          ...g.pending,
          { id: uuid(), partida_id: g.id, jugador_id: id, delta: lives - seat.lives, lives_after: lives, created_at: new Date().toISOString() },
        ],
      },
    );
    setDeltas((cur) => ({ ...cur, [id]: (cur[id] ?? 0) + lives - seat.lives }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      setDeltas((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
    }, 1500);
  }

  // Cierra la partida en Supabase; si no se puede, deja elegir entre salir igual o seguir.
  async function finish(next: () => Game | null) {
    const ended = { ...game, endedAt: new Date().toISOString(), synced: false };
    const res = await syncGame(ended);
    if (res.error && !confirm(`No se ha podido guardar la partida (${res.error}).\n\n¿Salir igual? Se perderá de las estadísticas.`)) return;
    update(next);
  }

  function rematch() {
    if (!confirm("¿Guardar esta partida y empezar otra con los mismos jugadores?")) return;
    finish(() => newGame(game.start, game.seats));
  }

  function exit() {
    if (!confirm("¿Terminar y guardar la partida?")) return;
    finish(() => null);
  }

  const alive = game.seats.filter((s) => s.lives > 0);
  const winner = game.seats.length > 1 && alive.length === 1 ? alive[0] : null;

  const grid = rows.map((size, r) => {
    const from = rows.slice(0, r).reduce((a, b) => a + b, 0);
    return game.seats.slice(from, from + size);
  });

  return (
    <div className="fixed inset-0 z-30 flex select-none flex-col gap-1 bg-black p-1">
      {grid.map((row, r) => (
        <div key={r} className="flex min-h-0 flex-1 gap-1">
          {row.map((s) => {
            const d = deltas[s.id];
            const dead = s.lives === 0;
            return (
              <div
                key={s.id}
                className={`relative flex min-w-0 flex-1 overflow-hidden rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,.35)] transition ${dead ? "opacity-40 grayscale" : ""}`}
                style={{ background: tileBg(s.color), containerType: "size" }}
              >
                <button onClick={() => add(s.id, -1)} aria-label={`Quitar vida a ${s.name}`} className="flex w-1/2 items-center justify-start pl-[5cqmin] text-[16cqmin] font-black text-white/35 active:bg-black/20">
                  −
                </button>
                <button onClick={() => add(s.id, 1)} aria-label={`Sumar vida a ${s.name}`} className="flex w-1/2 items-center justify-end pr-[5cqmin] text-[16cqmin] font-black text-white/35 active:bg-white/15">
                  +
                </button>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-white [text-shadow:0_2px_10px_rgba(0,0,0,.45)]">
                  <span className="max-w-[80%] truncate text-[11cqmin] font-black uppercase leading-tight tracking-wide">{s.name}</span>
                  <span key={s.lives} className="tabular animate-pop text-[48cqmin] font-black leading-none">
                    {dead ? "💀" : s.lives}
                  </span>
                  {d !== undefined && (
                    <span className={`absolute right-[22%] top-[22%] rounded-full px-[3cqmin] text-[10cqmin] font-black ${d > 0 ? "bg-white/30" : "bg-black/35"}`}>
                      {d > 0 ? `+${d}` : `−${-d}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/50 p-1 backdrop-blur">
          <span
            title={sync.error ?? undefined}
            className="px-2 text-xs text-white/70"
            onClick={() => sync.error && alert(`Sin guardar: ${sync.error}`)}
          >
            {sync.pending ? `⏳ ${sync.pending}` : "☁️ ✓"}
          </span>
          <button onClick={rematch} aria-label="Nueva partida" className="h-9 w-9 rounded-full text-lg text-white">↺</button>
          <button onClick={exit} aria-label="Terminar" className="h-9 w-9 rounded-full text-lg text-white">✕</button>
        </div>
      </div>

      {winner && dismissed !== winner.id && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl p-6 text-center text-white shadow-2xl" style={{ background: tileBg(winner.color) }}>
            <p className="text-6xl">🏆</p>
            <p className="text-3xl font-black uppercase [text-shadow:0_2px_10px_rgba(0,0,0,.45)]">{winner.name}</p>
            <p className="font-semibold">gana con {winner.lives} {winner.lives === 1 ? "vida" : "vidas"}</p>
            <div className="grid gap-2 pt-2">
              <button onClick={rematch} className="rounded-xl bg-white py-3 font-black text-black">↺ Otra partida</button>
              <button onClick={exit} className="rounded-xl bg-black/30 py-3 font-bold">Terminar</button>
              <button onClick={() => setDismissed(winner.id)} className="py-1 text-sm text-white/80">Seguir jugando</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Va subiendo la partida a Supabase en segundo plano; lo pendiente se guarda en el móvil y se reintenta.
function useSync(game: Game, update: Update) {
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const latest = useRef(game);
  useEffect(() => {
    latest.current = game;
  });

  const flush = useCallback(async () => {
    const snap = latest.current;
    if (busy.current || (snap.synced && !snap.pending.length)) return;
    busy.current = true;
    const res = await syncGame(snap);
    busy.current = false;
    setError(res.error);
    update((g) =>
      g?.id === snap.id
        ? {
            ...g,
            synced: g.synced || (res.header && g.endedAt === snap.endedAt),
            pending: g.pending.filter((m) => !res.sent.includes(m.id)),
          }
        : g,
    );
  }, [update]);

  useEffect(() => {
    flush();
  }, [game.synced, game.pending.length, flush]);

  useEffect(() => {
    const id = setInterval(flush, 10_000);
    return () => clearInterval(id);
  }, [flush]);

  return { pending: game.pending.length + (game.synced ? 0 : 1), error };
}

// Cuántas cartas va en cada fila; cada fila se estira a todo el ancho, así nunca queda hueco.
function useRows(n: number) {
  const [rows, setRows] = useState<number[]>([n]);
  useEffect(() => {
    function update() {
      if (window.innerWidth > window.innerHeight) {
        setRows(n <= 3 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)]);
      } else if (n <= 2) {
        setRows(Array(n).fill(1));
      } else {
        setRows([...Array(Math.floor(n / 2)).fill(2), ...(n % 2 ? [1] : [])]);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [n]);
  return rows;
}

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);
}
