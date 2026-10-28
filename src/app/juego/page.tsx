"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Status } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";
import { finalStandings, heal, hit, newGame, PALETTE as COLORS, syncGame, type Game, type Seat } from "@/lib/partidas";
import type { JornadaKind } from "@/lib/types";

const NORMAL = 6;
const SOBRANTES = 8;
const STORAGE_KEY = "lod-juego";

type Update = (fn: (g: Game | null) => Game | null) => void;
type Picker = { mode: "lanzar" | "recibir"; seat: Seat };

const tileBg = (color: string) =>
  `radial-gradient(circle at 30% 20%, color-mix(in srgb, ${color} 85%, white), ${color} 45%, color-mix(in srgb, ${color} 60%, black))`;

// Parte el nombre en 1 o 2 líneas equilibradas y calcula una letra que quepa entera en la carta.
function fitName(name: string, maxCqmin: number, widthCqw = 84) {
  const words = name.split(" ");
  let lines = [name];
  if ([...name].length > 10 && words.length > 1) {
    let best = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const b = words.slice(i).join(" ");
      const len = Math.max([...a].length, [...b].length);
      if (len < best) {
        best = len;
        lines = [a, b];
      }
    }
  }
  const longest = Math.max(...lines.map((l) => [...l].length));
  return { lines, fontSize: `min(${maxCqmin}cqmin, ${(widthCqw / (longest * 0.58)).toFixed(2)}cqw)` };
}

function FitName({ name, max, className = "" }: { name: string; max: number; className?: string }) {
  const { lines, fontSize } = fitName(name, max);
  return (
    <span className={`block text-center font-semibold leading-[1.05] ${className}`} style={{ fontSize }}>
      {lines.map((l) => (
        <span key={l} className="block whitespace-nowrap">{l}</span>
      ))}
    </span>
  );
}

export default function Juego() {
  const [game, setGame] = useState<Game | null>(null);
  const [summary, setSummary] = useState<Game | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      // Las partidas de versiones anteriores (sin id) no se pueden guardar en las estadísticas
      if (saved?.id && saved.pending)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGame({
          ...saved,
          zeroGoneBy: saved.zeroGoneBy ?? null,
          kind: saved.kind ?? "normal",
          bustOrder: saved.bustOrder ?? [],
          pending: saved.pending.map((m: Game["pending"][number]) => ({ ...m, kind: m.kind ?? "vida", from_jugador_id: m.from_jugador_id ?? null })),
        });
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

  return (
    <>
      {game ? <Board game={game} update={update} onFinished={setSummary} /> : <Setup onStart={(g) => update(() => g)} />}
      {summary && <Summary game={summary} onClose={() => setSummary(null)} />}
    </>
  );
}

// Resumen al cerrar una partida: puestos y puntos de liga según la tabla normal o de sobrantes
function Summary({ game, onClose }: { game: Game; onClose: () => void }) {
  const rows = finalStandings(game);
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-felt p-5 shadow-2xl">
        <div className="text-center">
          <p className="text-4xl">🏁</p>
          <h2 className="text-2xl font-bold">Resumen de la partida</h2>
          <p className="text-sm text-muted">
            {game.kind === "sobrante" ? "Sobrantes" : "Normal"} · {game.start} vidas · {game.seats.length} jugadores
          </p>
        </div>
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl p-3 text-white" style={{ background: tileBg(r.color) }}>
              <span className="w-8 text-center text-2xl">{medal[r.place - 1] ?? `${r.place}º`}</span>
              <span className="flex-1 text-lg font-semibold leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,.4)]">
                {r.name}
                <span className="block text-xs font-medium opacity-85">
                  {r.lives < 0 ? "💀 BUST" : r.lives === 0 ? "vida cero" : `${r.lives} ${r.lives === 1 ? "vida" : "vidas"}`}
                </span>
              </span>
              <span className="text-right [text-shadow:0_1px_4px_rgba(0,0,0,.4)]">
                <span className="tabular block text-3xl font-bold leading-none">{r.points ?? "–"}</span>
                <span className="text-xs opacity-85">puntos</span>
              </span>
            </li>
          ))}
        </ol>
        {rows[0]?.points === null && (
          <p className="text-center text-xs text-muted">No hay tabla de puntos para {game.seats.length} jugadores.</p>
        )}
        <button onClick={onClose} className="w-full rounded-2xl bg-gold py-3.5 text-lg font-bold text-felt">Cerrar</button>
      </div>
    </div>
  );
}

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const { players, loading, error } = useLeague();
  const [start, setStart] = useState(NORMAL);
  const [kind, setKind] = useState<JornadaKind>("normal");
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
        kind,
        seated.map((c) => ({ playerId: c.id.startsWith("wc-") ? null : c.id, name: c.name, color: color(c.id) })),
      ),
    );
  }


  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">⚔️ Modo juego</h1>

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: NORMAL, k: "normal" as const, label: "Normal", pts: "5-3-2-1-0" },
            { v: SOBRANTES, k: "sobrante" as const, label: "Sobrantes", pts: "9-6-4-2-0" },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => {
                setStart(o.v);
                setKind(o.k);
              }}
              className={`rounded-xl py-3 font-semibold transition ${kind === o.k ? "bg-gold text-felt" : "border border-line text-muted"}`}
            >
              {o.label}
              <span className="block text-xs font-medium opacity-80">{o.v} vidas · {o.pts}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 text-center">
          <span className="tabular text-6xl font-bold text-gold">{start}</span>
          <span className="ml-1 text-2xl">❤️</span>
          <p className="text-xs text-muted">
            + la vida cero{start !== (kind === "sobrante" ? SOBRANTES : NORMAL) ? ` · partida corta, puntúa como ${kind === "sobrante" ? "sobrantes" : "normal"}` : ""}
          </p>
        </div>
        <input
          type="range"
          min={1}
          max={12}
          value={start}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-label="Vidas iniciales"
          className="mt-3 h-10 !border-0 !bg-transparent !p-0 accent-[var(--gold)]"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>1</span>
          <span>desliza para una partida corta</span>
          <span>12</span>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm text-muted">Jugadores · toca para quitar, 🎨 para cambiar color</p>
        <div className="grid grid-cols-2 gap-2.5">
          {candidates.map((c) => {
            const on = !excluded.has(c.id);
            const isWild = c.id.startsWith("wc-");
            return (
              <div
                key={c.id}
                className={`relative h-24 overflow-hidden rounded-2xl shadow-lg transition ${on ? "" : "opacity-30 grayscale"}`}
                style={{ background: tileBg(color(c.id)), containerType: "size" }}
              >
                <button onClick={() => toggle(c.id)} className="flex h-full w-full items-end px-3 pb-2.5 pt-10 text-white">
                  <FitName name={c.name} max={22} className="w-full [text-shadow:0_1px_4px_rgba(0,0,0,.45)]" />
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
            className="whitespace-nowrap rounded-lg border border-gold px-3 text-sm font-semibold text-gold disabled:opacity-40"
          >
            🃏 Añadir
          </button>
        </div>
      </section>

      <button
        onClick={begin}
        disabled={seated.length < 2}
        className="w-full rounded-2xl bg-gold py-4 text-lg font-bold text-felt shadow-lg active:scale-[.99] disabled:opacity-40"
      >
        ¡Empezar! · {seated.length} jugadores
      </button>
    </div>
  );
}

function Board({ game, update, onFinished }: { game: Game; update: Update; onFinished: (g: Game) => void }) {
  const rows = useRows(game.seats.length);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sync = useSync(game, update);
  useWakeLock();

  function flash(text: string) {
    setToast(text);
    clearTimeout(timers.current.toast);
    timers.current.toast = setTimeout(() => setToast(null), 2200);
  }

  function apply(id: string, next: Game) {
    const before = game.seats.find((s) => s.id === id)!.lives;
    const after = next.seats.find((s) => s.id === id)!.lives;
    if (before === after) return;
    update((g) => (g?.id === next.id ? next : g));
    if (!game.zeroGoneBy && next.zeroGoneBy) flash("🚫 Se acabó la vida cero para todos");
    setDeltas((cur) => ({ ...cur, [id]: (cur[id] ?? 0) + after - before }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      setDeltas((cur) => {
        const rest = { ...cur };
        delete rest[id];
        return rest;
      });
    }, 1500);
  }

  function piscina(thrower: Seat, victim: Seat) {
    setPicker(null);
    apply(victim.id, hit(game, victim.id, "piscina", thrower.id));
    flash(`🏊 ${thrower.name} → 💧 ${victim.name}`);
  }

  // Cierra la partida en Supabase; si no se puede, deja elegir entre salir igual o seguir.
  async function finish(next: () => Game | null) {
    const ended = { ...game, endedAt: new Date().toISOString(), synced: false };
    const res = await syncGame(ended);
    if (res.error && !confirm(`No se ha podido guardar la partida (${res.error}).\n\n¿Salir igual? Se perderá de las estadísticas.`)) return;
    update(next);
    onFinished(ended);
  }

  function rematch() {
    if (!confirm("¿Guardar esta partida y empezar otra con los mismos jugadores?")) return;
    finish(() => newGame(game.start, game.kind, game.seats));
  }

  function exit() {
    if (!confirm("¿Terminar y guardar la partida?")) return;
    finish(() => null);
  }

  const alive = game.seats.filter((s) => s.lives >= 0);
  const winner = game.seats.length > 1 && alive.length === 1 ? alive[0] : null;

  const grid = rows.map((size, r) => {
    const from = rows.slice(0, r).reduce((a, b) => a + b, 0);
    return game.seats.slice(from, from + size);
  });

  return (
    <div
      className="fixed inset-0 z-30 flex select-none flex-col gap-1 bg-black"
      style={{ padding: "max(4px, env(safe-area-inset-top)) max(4px, env(safe-area-inset-right)) max(4px, env(safe-area-inset-bottom)) max(4px, env(safe-area-inset-left))" }}
    >
      {grid.map((row, r) => (
        <div key={r} className="flex min-h-0 flex-1 gap-1">
          {row.map((s) => {
            const d = deltas[s.id];
            const bust = s.lives < 0;
            const zero = s.lives === 0;
            return (
              <div
                key={s.id}
                className={`relative flex min-w-0 flex-1 overflow-hidden rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,.3)] ${zero ? "ring-4 ring-inset ring-white/70" : ""}`}
                style={{ background: tileBg(s.color), containerType: "size" }}
              >
                {bust && <div className="absolute inset-0 bg-[#111]/85" />}
                <button onClick={() => apply(s.id, hit(game, s.id))} aria-label={`Quitar vida a ${s.name}`} className="relative flex w-1/2 items-center justify-start pl-[4cqmin] text-[14cqmin] font-light text-white/40 active:bg-black/20">
                  {bust ? "" : "−"}
                </button>
                <button onClick={() => apply(s.id, heal(game, s.id))} aria-label={`Sumar vida a ${s.name}`} className="relative flex w-1/2 items-center justify-end pr-[4cqmin] text-[14cqmin] font-light text-white/40 active:bg-white/15">
                  +
                </button>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between px-[6cqmin] pb-[4cqmin] pt-[6cqmin] text-white [text-shadow:0_2px_8px_rgba(0,0,0,.35)]">
                  <FitName name={s.name} max={11} className={`w-full ${bust ? "text-white/60" : ""}`} />

                  <div className="flex flex-col items-center">
                    {bust ? (
                      <>
                        <span className="text-[30cqmin] leading-none">💀</span>
                        <span className="text-[15cqmin] font-extrabold leading-none tracking-wide text-[#ff4040] [text-shadow:0_0_18px_rgba(255,40,40,.6)]">BUST!</span>
                      </>
                    ) : (
                      <>
                        <span key={s.lives} className="tabular animate-pop text-[44cqmin] font-bold leading-[0.9]">{s.lives}</span>
                        {zero && <span className="rounded-full bg-white/90 px-[3cqmin] text-[6cqmin] font-bold text-black [text-shadow:none]">VIDA CERO</span>}
                      </>
                    )}
                  </div>

                  <div className="pointer-events-auto flex gap-[3cqmin]">
                    {!bust && (
                      <>
                        <button
                          onClick={() => setPicker({ mode: "lanzar", seat: s })}
                          aria-label={`${s.name} lanza una piscina`}
                          className="flex h-[max(40px,13cqmin)] w-[max(40px,13cqmin)] items-center justify-center rounded-full bg-black/25 text-[max(20px,7cqmin)] active:scale-90"
                        >
                          🏊
                        </button>
                        {s.playerId && (
                          <button
                            onClick={() => setPicker({ mode: "recibir", seat: s })}
                            aria-label={`${s.name} recibe una piscina`}
                            className="flex h-[max(40px,13cqmin)] w-[max(40px,13cqmin)] items-center justify-center rounded-full bg-black/25 text-[max(20px,7cqmin)] active:scale-90"
                          >
                            💧
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {d !== undefined && (
                  <span className={`pointer-events-none absolute right-[8cqmin] top-[30%] rounded-full px-[3cqmin] text-[9cqmin] font-bold text-white ${d > 0 ? "bg-white/30" : "bg-black/40"}`}>
                    {d > 0 ? `+${d}` : `−${-d}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/55 p-1 text-white backdrop-blur">
          <span className="px-2 text-xs text-white/80" title="Vida cero">{game.zeroGoneBy ? "0 🚫" : "0 ✓"}</span>
          {sync.error ? (
            <button onClick={() => alert(`No se está guardando la partida:\n\n${sync.error}`)} className="rounded-full bg-[#d33] px-2.5 py-1 text-xs font-semibold">
              ⚠️ Sin guardar
            </button>
          ) : (
            <span className="px-1 text-xs text-white/70">{sync.pending ? `⏳ ${sync.pending}` : "☁️ ✓"}</span>
          )}
          <button onClick={rematch} aria-label="Nueva partida" className="h-9 w-9 rounded-full text-lg">↺</button>
          <button onClick={exit} aria-label="Terminar" className="h-9 w-9 rounded-full text-lg">✕</button>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-20 flex justify-center px-4">
          <p className="rounded-2xl bg-black/80 px-4 py-2.5 text-center text-base font-semibold text-white shadow-xl backdrop-blur">{toast}</p>
        </div>
      )}

      {picker && <PiscinaPicker picker={picker} seats={game.seats} onPick={piscina} onClose={() => setPicker(null)} />}

      {winner && !picker && dismissed !== winner.id && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl p-6 text-center text-white shadow-2xl" style={{ background: tileBg(winner.color), containerType: "inline-size" }}>
            <p className="text-6xl">🏆</p>
            <FitName name={winner.name} max={14} className="text-[2rem] font-bold [text-shadow:0_2px_10px_rgba(0,0,0,.4)]" />
            <p className="font-medium">
              gana {winner.lives === 0 ? "en vida cero" : `con ${winner.lives} ${winner.lives === 1 ? "vida" : "vidas"}`}
            </p>
            <div className="grid gap-2 pt-2">
              <button onClick={rematch} className="rounded-xl bg-white py-3 font-bold text-black">↺ Otra partida</button>
              <button onClick={exit} className="rounded-xl bg-black/30 py-3 font-semibold">Terminar</button>
              <button onClick={() => setDismissed(winner.id)} className="py-1 text-sm text-white/80">Seguir jugando</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lanzar: el que pulsa elige a quién (solo jugadores de liga). Recibir: el que pulsa elige quién se la lanzó.
function PiscinaPicker({ picker, seats, onPick, onClose }: {
  picker: Picker;
  seats: Seat[];
  onPick: (thrower: Seat, victim: Seat) => void;
  onClose: () => void;
}) {
  const { mode, seat } = picker;
  const options = seats.filter((s) => s.id !== seat.id && s.lives >= 0 && (mode === "recibir" || s.playerId));
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-3xl bg-felt p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-lg font-semibold text-ink">
          {mode === "lanzar" ? `🏊 ¿A quién le lanza la piscina ${seat.name}?` : `💧 ¿Quién le ha lanzado la piscina a ${seat.name}?`}
        </p>
        {options.length === 0 ? (
          <p className="py-4 text-center text-muted">No hay a quién</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => (mode === "lanzar" ? onPick(seat, o) : onPick(o, seat))}
                className="flex h-20 items-center rounded-2xl px-3 text-white shadow-lg active:scale-95"
                style={{ background: tileBg(o.color), containerType: "inline-size" }}
              >
                <FitName name={o.name} max={60} className="w-full text-lg [text-shadow:0_1px_4px_rgba(0,0,0,.4)]" />
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-xl border border-line py-3 font-semibold text-muted">Cancelar</button>
      </div>
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
