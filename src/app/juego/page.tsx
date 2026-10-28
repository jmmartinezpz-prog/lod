"use client";

import { useEffect, useRef, useState } from "react";
import { Status } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";

const COLORS = ["#e0645a", "#4f8fe0", "#e2b84b", "#5cbf7a", "#a46be0", "#e08a3c", "#3cc4c4", "#e06bb0"];
const PRESETS = [10, 20, 30, 40];
const STORAGE_KEY = "lod-juego";

type Seat = { id: string; name: string; color: string; lives: number };
type Game = { start: number; seats: Seat[] };

const tileBg = (color: string) =>
  `radial-gradient(circle at 30% 20%, color-mix(in srgb, ${color} 85%, white), ${color} 45%, color-mix(in srgb, ${color} 60%, black))`;

export default function Juego() {
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setGame(JSON.parse(saved));
    } catch {}
  }, []);

  function save(next: Game | null) {
    setGame(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  return game ? <Board game={game} onChange={save} /> : <Setup onStart={save} />;
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
    onStart({ start, seats: seated.map((c) => ({ id: c.id, name: c.name, color: color(c.id), lives: start })) });
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

function Board({ game, onChange }: { game: Game; onChange: (g: Game | null) => void }) {
  const rows = useRows(game.seats.length);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useWakeLock();

  function add(id: string, delta: number) {
    const seat = game.seats.find((s) => s.id === id)!;
    const lives = Math.max(0, seat.lives + delta);
    if (lives === seat.lives) return;
    onChange({ ...game, seats: game.seats.map((s) => (s.id === id ? { ...s, lives } : s)) });
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

  function reset() {
    if (!confirm("¿Reiniciar las vidas de todos?")) return;
    onChange({ ...game, seats: game.seats.map((s) => ({ ...s, lives: game.start })) });
  }

  function exit() {
    if (!confirm("¿Terminar la partida?")) return;
    onChange(null);
  }

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
        <div className="pointer-events-auto flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur">
          <button onClick={reset} aria-label="Reiniciar" className="h-9 w-9 rounded-full text-lg text-white">↺</button>
          <button onClick={exit} aria-label="Terminar" className="h-9 w-9 rounded-full text-lg text-white">✕</button>
        </div>
      </div>
    </div>
  );
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
