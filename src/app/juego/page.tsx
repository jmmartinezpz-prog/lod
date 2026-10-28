"use client";

import { useEffect, useState } from "react";
import { Status } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";

const COLORS = ["#e0645a", "#4f8fe0", "#e2b84b", "#5cbf7a", "#a46be0", "#e08a3c", "#3cc4c4", "#e06bb0"];
const STORAGE_KEY = "lod-juego";

type Seat = { id: string; name: string; color: string; lives: number };
type Game = { start: number; seats: Seat[] };

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
  const [start, setStart] = useState(10);
  const [picked, setPicked] = useState<{ id: string; color: string }[]>([]);

  if (loading || error) return <Status loading={loading} error={error} />;

  const roster = players
    .filter((p) => p.active)
    .sort((a, b) => (a.seat_order ?? 99) - (b.seat_order ?? 99) || a.nickname.localeCompare(b.nickname));
  const byId = new Map(roster.map((p) => [p.id, p]));

  function toggle(id: string) {
    setPicked((cur) => {
      if (cur.some((s) => s.id === id)) return cur.filter((s) => s.id !== id);
      const free = COLORS.find((c) => !cur.some((s) => s.color === c)) ?? COLORS[cur.length % COLORS.length];
      return [...cur, { id, color: free }];
    });
  }

  function cycleColor(id: string) {
    setPicked((cur) =>
      cur.map((s) => (s.id === id ? { ...s, color: COLORS[(COLORS.indexOf(s.color) + 1) % COLORS.length] } : s)),
    );
  }

  function begin() {
    onStart({
      start,
      seats: picked.map((s) => {
        const p = byId.get(s.id)!;
        return { id: s.id, name: `${p.emoji ? `${p.emoji} ` : ""}${p.nickname}`, color: s.color, lives: start };
      }),
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Modo juego</h1>

      <div className="space-y-3 rounded-xl border border-line bg-card p-4">
        <label className="block text-sm text-muted">Vidas iniciales</label>
        <div className="flex items-center gap-3">
          <button onClick={() => setStart((v) => Math.max(1, v - 1))} className="h-11 w-11 rounded-lg border border-line text-xl">−</button>
          <input
            type="number"
            min={1}
            value={start}
            onChange={(e) => setStart(Math.max(1, Number(e.target.value) || 1))}
            className="tabular text-center text-xl font-bold"
          />
          <button onClick={() => setStart((v) => v + 1)} className="h-11 w-11 rounded-lg border border-line text-xl">+</button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted">Jugadores (toca el color para cambiarlo)</p>
        {roster.map((p) => {
          const seat = picked.find((s) => s.id === p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${seat ? "border-gold bg-card" : "border-line"}`}
            >
              <button onClick={() => toggle(p.id)} className="flex flex-1 items-center gap-3 text-left">
                <span className={`flex h-6 w-6 items-center justify-center rounded border ${seat ? "border-gold bg-gold text-felt" : "border-line"}`}>
                  {seat ? "✓" : ""}
                </span>
                <span className="font-semibold">{p.emoji ? `${p.emoji} ` : ""}{p.nickname}</span>
              </button>
              {seat && (
                <button
                  onClick={() => cycleColor(p.id)}
                  aria-label="Cambiar color"
                  className="h-8 w-8 rounded-full border-2 border-ink/40"
                  style={{ background: seat.color }}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={begin}
        disabled={picked.length < 2}
        className="w-full rounded-lg bg-gold py-3 font-bold text-felt disabled:opacity-40"
      >
        Empezar ({picked.length} jugadores)
      </button>
    </div>
  );
}

function Board({ game, onChange }: { game: Game; onChange: (g: Game | null) => void }) {
  const cols = useColumns(game.seats.length);
  useWakeLock();

  function add(id: string, delta: number) {
    onChange({
      ...game,
      seats: game.seats.map((s) => (s.id === id ? { ...s, lives: Math.max(0, s.lives + delta) } : s)),
    });
  }

  function reset() {
    if (!confirm("¿Reiniciar las vidas de todos?")) return;
    onChange({ ...game, seats: game.seats.map((s) => ({ ...s, lives: game.start })) });
  }

  function exit() {
    if (!confirm("¿Terminar la partida?")) return;
    onChange(null);
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-felt select-none">
      <div
        className="grid flex-1 gap-1 p-1"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: "1fr" }}
      >
        {game.seats.map((s) => (
          <div
            key={s.id}
            className={`relative flex overflow-hidden rounded-xl transition-opacity ${s.lives === 0 ? "opacity-35 grayscale" : ""}`}
            style={{ background: s.color, containerType: "size" }}
          >
            <button onClick={() => add(s.id, -1)} aria-label={`Quitar vida a ${s.name}`} className="flex w-1/2 items-center justify-start pl-[6cqmin] text-[14cqmin] font-black text-black/30 active:bg-black/15">
              −
            </button>
            <button onClick={() => add(s.id, 1)} aria-label={`Sumar vida a ${s.name}`} className="flex w-1/2 items-center justify-end pr-[6cqmin] text-[14cqmin] font-black text-black/30 active:bg-black/15">
              +
            </button>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[#141414]">
              <span className="max-w-[90%] truncate text-[11cqmin] font-bold leading-tight">{s.name}</span>
              <span className="tabular text-[45cqmin] font-black leading-none">{s.lives === 0 ? "💀" : s.lives}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-2 py-1.5 text-xs">
        <button onClick={reset} className="rounded-full border border-line px-3 py-1 text-muted">↺ Reiniciar</button>
        <button onClick={exit} className="rounded-full border border-line px-3 py-1 text-muted">✕ Terminar</button>
      </div>
    </div>
  );
}

function useColumns(n: number) {
  const [cols, setCols] = useState(1);
  useEffect(() => {
    function update() {
      const landscape = window.innerWidth > window.innerHeight;
      if (n <= 2) setCols(landscape ? n : 1);
      else if (n <= 4) setCols(2);
      else setCols(landscape ? Math.ceil(n / 2) : 2);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [n]);
  return cols;
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
