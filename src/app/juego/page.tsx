"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Status } from "@/components/Status";
import { useLeague } from "@/lib/useLeague";
import { cancelGame, cerrarPartida, coloresDeLiga, marcar, tocaTipo, type Marca, finalStandings, GAME_COLORS, heal, hit, newGame, syncGame, type Game, type Seat } from "@/lib/partidas";
import type { JornadaKind } from "@/lib/types";
import { playerLabel } from "@/lib/history";
import { esCampeon, Starred } from "@/components/Status";
import { MeterLlave, QuienApunta } from "@/components/Llave";
import { usePermiso } from "@/lib/llave";
import { supabase } from "@/lib/supabase";

const NORMAL = 6;
const SOBRANTES = 8;
const STORAGE_KEY = "lod-juego";

type Update = (fn: (g: Game | null) => Game | null) => void;
type Secado = { thrower: Seat; victim: Seat };

const tileBg = (color: string) =>
  `radial-gradient(circle at 30% 20%, color-mix(in srgb, ${color} 85%, white), ${color} 45%, color-mix(in srgb, ${color} 60%, black))`;

const ORDER_KEY = "lod-orden-asientos"; // cómo nos sentamos la última vez

function readOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveOrder(ids: string[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {}
}

const COLORS_KEY = "lod-colores"; // copia en el móvil por si aún no está 17_colores.sql

function readColors(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COLORS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveColors(colors: Record<string, string>) {
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
  } catch {}
}

// Guarda el color en la liga para que salga igual en todos los móviles
async function ponerColor(playerId: string, hex: string) {
  const { error } = await supabase.rpc("poner_color", { p_player: playerId, p_color: hex });
  return error?.message ?? null;
}

function moveTo<T>(list: T[], from: number, to: number) {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

// Arrastrar cartas para recolocarlas: lo que hay bajo el dedo (data-drag-key) cambia de sitio al vuelo
function useDragOrder(onMove: (dragged: string, over: string) => void) {
  const [dragging, setDragging] = useState<string | null>(null);
  const move = useRef(onMove);
  useEffect(() => {
    move.current = onMove;
  });

  useEffect(() => {
    if (!dragging) return;
    function onPointerMove(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drag-key]");
      const over = el?.dataset.dragKey;
      if (over && over !== dragging) move.current(dragging!, over);
    }
    const stop = () => setDragging(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging]);

  const handle = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(key);
    },
    style: { touchAction: "none" } as React.CSSProperties,
  });
  return { dragging, handle };
}

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
  // El nombre se parte en líneas: el dorado del campeón se decide con el nombre entero
  const oro = esCampeon(name);
  return (
    <span className={`block text-center font-semibold leading-[1.05] ${oro ? "[&_.text-gold]:text-[#ffd75e] [&_.text-gold]:[text-shadow:0_1px_2px_rgba(0,0,0,.85),0_0_14px_rgba(0,0,0,.55)]" : ""} ${className}`} style={{ fontSize }}>
      {lines.map((l) => (
        <span key={l} className="block whitespace-nowrap"><Starred name={l} oro={oro} /></span>
      ))}
    </span>
  );
}

export default function Juego() {
  const [game, setGame] = useState<Game | null>(null);
  const [summary, setSummary] = useState<Game | null>(null);
  const [liga, setLiga] = useState<Liga | null>(null);

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
          secadas: saved.secadas ?? {},
          tiradas: saved.tiradas ?? {},
          marcas: saved.marcas ?? {},
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
      {game ? <Board game={game} update={update} onFinished={(g, l) => { setSummary(g); setLiga(l); }} /> : <Setup onStart={(g) => update(() => g)} />}
      {summary && (
        <Summary
          game={summary}
          liga={liga}
          onRetry={async () => setLiga(await cerrarPartida(summary.id))}
          onSalir={() => setSummary(null)}
          onOtra={(kind) => {
            update(() => newGame(kind === "sobrante" ? SOBRANTES : NORMAL, kind, summary.seats));
            setSummary(null);
          }}
        />
      )}
    </>
  );
}

type Liga = { jornada: number | null; error: string | null };

// Resumen al cerrar una partida: puestos y puntos de liga según la tabla normal o de sobrantes
function Summary({ game, liga, onRetry, onSalir, onOtra }: {
  game: Game;
  liga: Liga | null;
  onRetry: () => void;
  onSalir: () => void;
  onOtra: (kind: JornadaKind) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false); // otra partida: ¿normal o sobrantes?
  const { jornadas } = useLeague();
  // Lo que toca ahora, contando la que se acaba de guardar aunque aún no haya llegado a la liga
  const kinds = jornadas.toSorted((a, b) => a.number - b.number).map((j) => j.kind);
  if (liga?.jornada && !jornadas.some((j) => j.number === liga.jornada)) kinds.push(game.kind);
  const toca = tocaTipo(kinds);
  const rows = finalStandings(game);
  const medal = ["🥇", "🥈", "🥉"];
  const minutos = game.endedAt ? Math.max(1, Math.round((Date.parse(game.endedAt) - Date.parse(game.startedAt)) / 60000)) : null;
  const piscinas = Object.values(game.secadas ?? {}).reduce((a, b) => a + b, 0);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-felt p-5 shadow-2xl">
        <div className="text-center">
          <p className="text-4xl">🏁</p>
          <h2 className="text-2xl font-bold">Resumen de la partida</h2>
          <p className="text-sm text-muted">
            {game.kind === "sobrante" ? "Sobrantes" : "Normal"} · {game.start} vidas · {game.seats.length} jugadores
          </p>
          <p className="text-sm text-muted">
            {minutos && `⏱ ${minutos} min · `}🏊 {piscinas} {piscinas === 1 ? "piscina" : "piscinas"}
          </p>
        </div>
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl p-3 text-white" style={{ background: tileBg(r.color) }}>
              <span className="w-8 text-center text-2xl">{medal[r.place - 1] ?? `${r.place}º`}</span>
              <span className="flex-1 text-lg font-semibold leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,.4)]">
                <Starred name={r.name} />
                <span className="block text-xs font-medium opacity-85">
                  {r.lives < 0 ? "💀 BUST" : r.lives === 0 ? "vida cero" : `${r.lives} ${r.lives === 1 ? "vida" : "vidas"}`}
                  {(game.tiradas?.[r.id] ?? 0) > 0 && ` · 🏊 ${game.tiradas[r.id]} lanzada${game.tiradas[r.id] > 1 ? "s" : ""}`}
                  {(game.secadas?.[r.id] ?? 0) > 0 && ` · 💧 ${game.secadas[r.id]} recibida${game.secadas[r.id] > 1 ? "s" : ""}`}
                  {(game.marcas?.[r.id]?.historia ?? 0) > 0 && ` · 📜 ${game.marcas[r.id].historia}`}
                  {(game.marcas?.[r.id]?.escalera_tirada ?? 0) > 0 && ` · 🪜 ${game.marcas[r.id].escalera_tirada}`}
                  {(game.marcas?.[r.id]?.escalera_remada ?? 0) > 0 && ` · 🚣 ${game.marcas[r.id].escalera_remada}`}
                </span>
              </span>
              <span className="text-right [text-shadow:0_1px_4px_rgba(0,0,0,.4)]">
                <span className="tabular block text-3xl font-bold leading-none">{r.points}</span>
                <span className="text-xs opacity-85">puntos</span>
              </span>
            </li>
          ))}
        </ol>
        {liga?.jornada ? (
          <p className="rounded-2xl bg-gold/15 p-3 text-center font-semibold text-gold">📒 Guardada en la liga como J{liga.jornada}</p>
        ) : (
          <div className="space-y-2 rounded-2xl border border-red/60 p-3 text-center text-sm">
            <p className="text-red">No se ha podido pasar a la liga{liga?.error ? `: ${liga.error}` : ""}</p>
            <button onClick={onRetry} className="rounded-full bg-red px-4 py-1.5 font-semibold text-white">Reintentar</button>
          </div>
        )}
        {eligiendo ? (
          <div className="space-y-2">
            <p className="text-center font-semibold">¿Qué jugamos ahora?</p>
            <p className="text-center text-xs text-muted">Toca {toca.kind === "sobrante" ? "♻️ sobrantes" : "🎲 normal"}: {toca.motivo}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "normal" as const, label: "Normal", v: NORMAL, pts: "5-3-2-1-0" },
                { k: "sobrante" as const, label: "Sobrantes", v: SOBRANTES, pts: "9-6-4-2-0" },
              ].map((o) => (
                <button
                  key={o.k}
                  onClick={() => onOtra(o.k)}
                  className={`rounded-2xl py-3.5 font-bold ${o.k === toca.kind ? "bg-gold text-felt" : "border border-gold text-gold"}`}
                >
                  {o.label}
                  {o.k === toca.kind && <span className="ml-1.5 rounded-full bg-black/15 px-1.5 text-[10px] uppercase">toca</span>}
                  <span className="block text-xs font-medium opacity-80">{o.v} vidas · {o.pts}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setEligiendo(false)} className="w-full py-2 text-sm text-muted">Volver</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onSalir} className="rounded-2xl border border-line py-3.5 text-lg font-semibold text-ink">🚪 Salir</button>
            <button onClick={() => setEligiendo(true)} className="rounded-2xl bg-gold py-3.5 text-lg font-bold text-felt">↺ Otra partida</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const { players, standings, jornadas, loading, error } = useLeague();
  // Lo normal: dos normales y una de sobrantes. Se sugiere sola según las últimas jornadas
  const sugerida = tocaTipo(jornadas.toSorted((a, b) => a.number - b.number).map((j) => j.kind));
  const [kindElegido, setKind] = useState<JornadaKind | null>(null);
  const [startElegido, setStart] = useState<number | null>(null);
  const kind = kindElegido ?? sugerida.kind;
  const start = startElegido ?? (kind === "sobrante" ? SOBRANTES : NORMAL);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [colorOf, setColorOf] = useState<Record<string, string>>({}); // copia local
  const [picks, setPicks] = useState<Record<string, string>>({}); // cambiados ahora con 🎨
  const [painting, setPainting] = useState<string | null>(null); // jugador eligiendo color
  const [wildcards, setWildcards] = useState<{ id: string; name: string }[]>([]);
  const [wildName, setWildName] = useState("");
  const [orden, setOrden] = useState<string[]>([]);
  const permiso = usePermiso();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrden(readOrder());
    setColorOf(readColors());
  }, []);

  if (loading || error) return <Status loading={loading} error={error} />;

  const regulars = players
    .filter((p) => p.active && !p.is_wildcard)
    .sort((a, b) => (a.seat_order ?? 99) - (b.seat_order ?? 99) || a.nickname.localeCompare(b.nickname))
    .map((p) => ({ id: p.id, name: playerLabel(p) }));
  // En pantalla, por la clasificación de ahora (👑 primero, 🕳️ al final, wildcards detrás)
  const puesto = (id: string) => {
    const i = standings.findIndex((s) => s.player.id === id);
    return i < 0 ? 999 : i;
  };
  // En la partida, como nos sentamos la última vez; los que no estaban, detrás
  const pos = (id: string) => {
    const i = orden.indexOf(id);
    return i < 0 ? 999 : i;
  };
  const candidates = [...regulars, ...wildcards].map((c, i) => ({ c, i })).sort((a, b) => puesto(a.c.id) - puesto(b.c.id) || a.i - b.i).map(({ c }) => c);
  const seated = candidates.filter((c) => !excluded.has(c.id));
  // Los colores no dependen de dónde se siente cada uno: orden fijo de la liga, y los elegidos se recuerdan
  const elegidos = {
    ...colorOf,
    ...Object.fromEntries(coloresDeLiga(players)), // los mismos que ven las estadísticas
    ...picks,
  };
  const assigned = assignColors(
    [...regulars, ...wildcards].sort((a, b) => Number(excluded.has(a.id)) - Number(excluded.has(b.id))).map((c) => c.id),
    elegidos,
  );
  const color = (id: string) => assigned.get(id)!;
  // Dueño de cada color entre los que juegan (para bloquearlo a los demás)
  const owner = new Map(seated.map((c) => [color(c.id), c]));

  function toggle(id: string) {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickColor(id: string, hex: string) {
    // Si lo tenía alguien que no juega, ese se queda con otro libre automáticamente
    setPicks((cur) => {
      const next = { ...cur, [id]: hex };
      for (const k of Object.keys(next)) if (k !== id && next[k] === hex) delete next[k];
      return next;
    });
    setColorOf((cur) => {
      const next = { ...cur, [id]: hex };
      for (const k of Object.keys(next)) if (k !== id && next[k] === hex) delete next[k];
      saveColors(next);
      return next;
    });
    if (!id.startsWith("wc-")) ponerColor(id, hex);
    setPainting(null);
  }

  function addWildcard() {
    const name = wildName.trim();
    if (!name) return;
    setWildcards((cur) => [...cur, { id: `wc-${Date.now()}`, name: `🃏 ${name}` }]);
    setWildName("");
  }

  function begin() {
    // Cada jugador de la liga se queda con su color para las próximas partidas, en todos los móviles
    const fijos = { ...colorOf };
    for (const r of regulars) {
      fijos[r.id] = color(r.id);
      if (players.find((p) => p.id === r.id)?.color !== color(r.id)) ponerColor(r.id, color(r.id));
    }
    saveColors(fijos);
    onStart(
      newGame(
        start,
        kind,
        seated
          .map((c, i) => ({ c, i }))
          .sort((a, b) => pos(a.c.id) - pos(b.c.id) || a.i - b.i)
          .map(({ c }) => ({ playerId: c.id.startsWith("wc-") ? null : c.id, name: c.name, color: color(c.id) })),
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
              {o.k === sugerida.kind && <span className="ml-1.5 rounded-full bg-black/15 px-1.5 text-[10px] uppercase">toca</span>}
              <span className="block text-xs font-medium opacity-80">{o.v} vidas · {o.pts}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Toca {sugerida.kind === "sobrante" ? "♻️ sobrantes" : "🎲 normal"}: {sugerida.motivo}
        </p>

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
        <p className="text-sm text-muted">Jugadores · toca para quitar, 🎨 para cambiar color. El orden de la mesa se coloca ya jugando, con ⇅.</p>
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
                  onClick={() => setPainting(c.id)}
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

        {painting && (
          <ColorPicker
            name={candidates.find((c) => c.id === painting)?.name ?? ""}
            current={color(painting)}
            owner={(hex) => {
              const o = owner.get(hex);
              return o && o.id !== painting ? o.name : null;
            }}
            onPick={(hex) => pickColor(painting, hex)}
            onClose={() => setPainting(null)}
          />
        )}

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

      <MeterLlave permiso={permiso} que="apuntar partidas" />
      <QuienApunta permiso={permiso} />
      <button
        onClick={begin}
        disabled={seated.length < 2 || !permiso.puede}
        className="w-full rounded-2xl bg-gold py-4 text-lg font-bold text-felt shadow-lg active:scale-[.99] disabled:opacity-40"
      >
        ¡Empezar! · {seated.length} jugadores
      </button>
    </div>
  );
}

// Reparte colores sin repetir: primero se respetan los elegidos (en orden), el resto coge el primero libre
function assignColors(ids: string[], chosen: Record<string, string>) {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    const want = chosen[id];
    if (want && !used.has(want)) {
      out.set(id, want);
      used.add(want);
    }
  }
  for (const id of ids) {
    if (out.has(id)) continue;
    const free = GAME_COLORS.find((c) => !used.has(c.hex))?.hex ?? GAME_COLORS[0].hex;
    out.set(id, free);
    used.add(free);
  }
  return out;
}

function ColorPicker({ name, current, owner, onPick, onClose }: {
  name: string;
  current: string;
  owner: (hex: string) => string | null; // quién lo tiene ya (null = libre)
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-felt p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-lg font-semibold">
          🎨 Color de <Starred name={name} />
        </p>
        <div className="grid grid-cols-6 gap-2.5">
          {GAME_COLORS.map((c) => {
            const taken = owner(c.hex);
            const mine = c.hex === current;
            return (
              <button
                key={c.hex}
                onClick={() => !taken && onPick(c.hex)}
                disabled={Boolean(taken)}
                title={taken ? `${c.name} · lo tiene ${taken}` : c.name}
                aria-label={taken ? `${c.name}, ocupado por ${taken}` : c.name}
                className={`relative aspect-square rounded-full shadow-md transition active:scale-90 ${
                  mine ? "ring-4 ring-white ring-offset-2 ring-offset-[var(--felt)]" : ""
                } ${taken ? "opacity-35" : ""}`}
                style={{ background: tileBg(c.hex) }}
              >
                {mine && <span className="text-lg text-white">✓</span>}
                {taken && (
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                    {[...taken.replace(/^\P{L}+/u, "")][0]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted">Los colores con inicial ya los tiene otro jugador</p>
        <button onClick={onClose} className="w-full rounded-xl border border-line py-3 font-semibold text-muted">Cerrar</button>
      </div>
    </div>
  );
}

function Board({ game, update, onFinished }: { game: Game; update: Update; onFinished: (g: Game, liga: Liga) => void }) {
  const rows = useRows(game.seats.length);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [picker, setPicker] = useState<Seat | null>(null); // quién va a lanzar una piscina
  const [secado, setSecado] = useState<Secado | null>(null);
  const [marcando, setMarcando] = useState<{ seat: Seat; tipo: "historia" | "escalera" } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [ordering, setOrdering] = useState(false); // recolocar cartas según cómo estamos sentados
  const drag = useDragOrder((dragged, over) =>
    update((g) => {
      if (!g) return g;
      const ids = g.seats.map((s) => s.id);
      const seats = moveTo(g.seats, ids.indexOf(dragged), ids.indexOf(over));
      saveOrder(seats.flatMap((s) => (s.playerId ? [s.playerId] : [])));
      return { ...g, seats };
    }),
  );
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

  function apuntar(seat: Seat, kind: Marca) {
    setMarcando(null);
    update((g) => (g?.id === game.id ? marcar(g, seat.id, kind) : g));
    flash(kind === "historia" ? `📜 +1 de historia para ${seat.name}` : kind === "escalera_tirada" ? `🪜 Escalera de ${seat.name}` : `🚣 ${seat.name} rema la escalera`);
  }

  function piscina(thrower: Seat, victim: Seat) {
    setPicker(null);
    const next = hit(game, victim.id, "piscina", thrower.id);
    apply(victim.id, {
      ...next,
      secadas: { ...next.secadas, [victim.id]: (next.secadas[victim.id] ?? 0) + 1 },
      tiradas: thrower.id === victim.id ? next.tiradas : { ...next.tiradas, [thrower.id]: (next.tiradas[thrower.id] ?? 0) + 1 },
    });
    setSecado({ thrower, victim });
    clearTimeout(timers.current.secado);
    timers.current.secado = setTimeout(() => setSecado(null), 3500);
  }

  // Cierra la partida en Supabase; si no se puede, deja elegir entre salir igual o seguir.
  async function finish(next: () => Game | null) {
    const ended = { ...game, endedAt: new Date().toISOString(), synced: false };
    const res = await syncGame(ended);
    if (res.error && !confirm(`No se ha podido guardar la partida (${res.error}).\n\n¿Salir igual? Se perderá de la liga y de las estadísticas.`)) return;
    const liga = res.error ? { jornada: null, error: res.error } : await cerrarPartida(ended.id);
    update(next);
    onFinished(ended, liga);
  }

  function exit() {
    setMenu(false);
    finish(() => null);
  }

  // Para pruebas o errores: se cierra sin resumen y no cuenta en las estadísticas
  async function cancel() {
    if (!confirm("¿Cancelar la partida?\n\nNo contará para nada en las estadísticas.")) return;
    const error = await cancelGame(game);
    if (error && !confirm(`No se ha podido marcar como cancelada (${error}).\n\n¿Salir igual?`)) return;
    setMenu(false);
    update(() => null);
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
                data-drag-key={s.id}
                className={`relative flex min-w-0 flex-1 overflow-hidden rounded-2xl shadow-[inset_0_0_40px_rgba(0,0,0,.3)] ${zero ? "ring-4 ring-inset ring-white/70" : ""} ${drag.dragging === s.id ? "scale-95 opacity-80" : ""}`}
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

                  <div className="pointer-events-auto flex items-center gap-[3cqmin]">
                    <button
                      onClick={() => setMarcando({ seat: s, tipo: "historia" })}
                      aria-label={`Punto de historia para ${s.name}`}
                      className="flex h-[max(32px,10cqmin)] w-[max(32px,10cqmin)] items-center justify-center rounded-full bg-black/20 text-[max(15px,5cqmin)] active:scale-90"
                    >
                      📜
                    </button>
                    {!bust && (
                      <button
                        onClick={() => setPicker(s)}
                        aria-label={`${s.name} lanza una piscina`}
                        className="flex h-[max(40px,13cqmin)] w-[max(40px,13cqmin)] items-center justify-center rounded-full bg-black/25 text-[max(20px,7cqmin)] active:scale-90"
                      >
                        🏊
                      </button>
                    )}
                    {!bust && (
                      <button
                        onClick={() => setMarcando({ seat: s, tipo: "escalera" })}
                        aria-label={`Escalera de ${s.name}`}
                        className="flex h-[max(32px,10cqmin)] w-[max(32px,10cqmin)] items-center justify-center rounded-full bg-black/20 text-[max(15px,5cqmin)] active:scale-90"
                      >
                        🪜
                      </button>
                    )}
                  </div>
                </div>

                {/* Piscinas que le han caído en esta partida */}
                {/* y lo apuntado: historia y escaleras */}
                {((game.secadas[s.id] ?? 0) > 0 || Object.values(game.marcas?.[s.id] ?? {}).some(Boolean)) && (
                  <span className="pointer-events-none absolute bottom-[4cqmin] right-[4cqmin] flex flex-col items-end gap-[1cqmin] text-[max(11px,4.5cqmin)] font-semibold leading-snug text-white">
                    {(game.secadas[s.id] ?? 0) > 0 && <span className="rounded-full bg-black/30 px-[2cqmin]">💧{game.secadas[s.id] > 1 && `×${game.secadas[s.id]}`}</span>}
                    {([["historia", "📜"], ["escalera_tirada", "🪜"], ["escalera_remada", "🚣"]] as const).map(([k, icono]) => {
                      const n = game.marcas?.[s.id]?.[k] ?? 0;
                      return n > 0 && <span key={k} className="rounded-full bg-black/30 px-[2cqmin]">{icono}{n > 1 && `×${n}`}</span>;
                    })}
                  </span>
                )}

                {ordering && (
                  <div
                    {...drag.handle(s.id)}
                    className="absolute inset-0 z-10 flex cursor-grab flex-col items-center justify-center gap-[2cqmin] border-4 border-dashed border-white/70 bg-black/35 text-white"
                  >
                    <span className="text-[22cqmin] leading-none">✋</span>
                    <FitName name={s.name} max={10} className="w-full px-[6cqmin] font-semibold" />
                  </div>
                )}

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
          <button
            onClick={() => setOrdering((o) => !o)}
            aria-label="Ordenar cartas"
            className={`h-9 rounded-full px-2.5 text-sm font-semibold ${ordering ? "bg-gold text-black" : ""}`}
          >
            {ordering ? "✓ Listo" : "⇅ Ordenar"}
          </button>
          <button onClick={() => setMenu(true)} aria-label="Terminar o cancelar" className="h-9 w-9 rounded-full text-lg">✕</button>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[12%] z-20 flex justify-center px-4">
          <p className="rounded-2xl bg-black/80 px-4 py-2.5 text-center text-base font-semibold text-white shadow-xl backdrop-blur">{toast}</p>
        </div>
      )}

      {menu && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setMenu(false)}>
          <div className="w-full max-w-sm space-y-2 rounded-3xl bg-felt p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="pb-1 text-center text-lg font-semibold text-ink">¿Qué hacemos con la partida?</p>
            <button onClick={exit} className="w-full rounded-2xl bg-gold py-3.5 font-bold text-felt">
              🏁 Terminar y guardar
              <span className="block text-xs font-medium opacity-80">Se apunta sola como jornada de liga y sale el resumen</span>
            </button>
            <button onClick={cancel} className="w-full rounded-2xl border border-red/60 py-3.5 font-semibold text-red">
              🗑 Cancelar partida
              <span className="block text-xs font-medium opacity-80">Era una prueba o un error: no cuenta para nada</span>
            </button>
            <button onClick={() => setMenu(false)} className="w-full py-2 text-sm text-muted">Seguir jugando</button>
          </div>
        </div>
      )}

      {picker && <PiscinaPicker seat={picker} seats={game.seats} onPick={piscina} onClose={() => setPicker(null)} />}

      {/* Historia y escaleras: siempre con confirmación para no equivocarse */}
      {marcando && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setMarcando(null)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-felt p-4 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {marcando.tipo === "historia" ? (
              <>
                <p className="text-5xl">📜</p>
                <p className="text-lg font-semibold text-ink">¿Punto de historia para <Starred name={marcando.seat.name} />?</p>
                <button onClick={() => apuntar(marcando.seat, "historia")} className="w-full rounded-2xl bg-gold py-3.5 font-bold text-felt">Sí, +1 de historia</button>
              </>
            ) : (
              <>
                <p className="text-5xl">🪜</p>
                <p className="text-lg font-semibold text-ink">Escalera de <Starred name={marcando.seat.name} /></p>
                <button onClick={() => apuntar(marcando.seat, "escalera_tirada")} className="w-full rounded-2xl bg-gold py-3.5 font-bold text-felt">🪜 Ha tirado una escalera</button>
                <button onClick={() => apuntar(marcando.seat, "escalera_remada")} className="w-full rounded-2xl border border-gold py-3.5 font-bold text-gold">🚣 Ha remado una escalera</button>
              </>
            )}
            <button onClick={() => setMarcando(null)} className="w-full py-2 text-sm text-muted">Cancelar</button>
          </div>
        </div>
      )}

      {secado && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setSecado(null)}>
          <div
            className="animate-splash w-full max-w-sm space-y-2 rounded-3xl p-6 text-center text-white shadow-2xl"
            style={{ background: tileBg(secado.victim.color), containerType: "inline-size" }}
          >
            <p className="text-7xl">{secado.thrower.id === secado.victim.id ? "🤦💦" : "🏊💦"}</p>
            <FitName name={secado.victim.name} max={14} className="text-[2rem] font-bold [text-shadow:0_2px_10px_rgba(0,0,0,.4)]" />
            <p className="text-2xl font-extrabold [text-shadow:0_2px_10px_rgba(0,0,0,.4)]">
              {secado.thrower.id === secado.victim.id ? "¡Autopiscina! Te has secado tú solito" : "¡Te acaban de secar!"}
            </p>
            {secado.thrower.id !== secado.victim.id && <p className="text-sm font-medium opacity-90">Piscina de {secado.thrower.name}</p>}
          </div>
        </div>
      )}

      {winner && !picker && dismissed !== winner.id && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl p-6 text-center text-white shadow-2xl" style={{ background: tileBg(winner.color), containerType: "inline-size" }}>
            <p className="text-6xl">🏆</p>
            <p className="animate-splash text-[1.7rem] font-black uppercase leading-tight [text-shadow:0_2px_10px_rgba(0,0,0,.45)]">
              ¡SUUUP!
              <span className="block text-xl">Has secado a todos, máquina</span>
            </p>
            <FitName name={winner.name} max={14} className="text-[2rem] font-bold [text-shadow:0_2px_10px_rgba(0,0,0,.4)]" />
            <p className="font-medium">
              gana {winner.lives === 0 ? "en vida cero" : `con ${winner.lives} ${winner.lives === 1 ? "vida" : "vidas"}`}
            </p>
            <div className="grid gap-2 pt-2">
              <button onClick={exit} className="rounded-xl bg-white py-3.5 text-lg font-bold text-black">🏁 Finalizar partida</button>
              <div className="flex justify-center gap-4 pt-1 text-xs text-white/75">
                <button onClick={() => setDismissed(winner.id)} className="underline">¿Ha sido un error? Seguir jugando</button>
                <button onClick={cancel} className="underline">🗑 Cancelar (no cuenta)</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// El que lanza elige a quién (solo jugadores de liga)
function PiscinaPicker({ seat, seats, onPick, onClose }: {
  seat: Seat;
  seats: Seat[];
  onPick: (thrower: Seat, victim: Seat) => void;
  onClose: () => void;
}) {
  const options = seats.filter((s) => s.id !== seat.id && s.lives >= 0 && s.playerId);
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-3xl bg-felt p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-lg font-semibold text-ink">
          🏊 ¿A quién le lanza la piscina {seat.name}?
        </p>
        {options.length === 0 ? (
          <p className="py-4 text-center text-muted">No hay a quién</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => onPick(seat, o)}
                className="flex h-20 items-center rounded-2xl px-3 text-white shadow-lg active:scale-95"
                style={{ background: tileBg(o.color), containerType: "inline-size" }}
              >
                <FitName name={o.name} max={60} className="w-full text-lg [text-shadow:0_1px_4px_rgba(0,0,0,.4)]" />
              </button>
            ))}
          </div>
        )}
        <button onClick={() => onPick(seat, seat)} className="w-full py-1.5 text-sm text-muted underline">
          🤦 Autopiscina: se la tira {seat.name} solito
        </button>
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
