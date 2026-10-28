export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className="py-10 text-center text-muted">Tirando los dados…</p>;
  if (error)
    return (
      <p className="rounded-lg border border-red/50 bg-red/10 p-3 text-sm text-red">
        Error: {error}
      </p>
    );
  return null;
}

export function PlayerName({ nickname, emoji, mundiales = 0, campeon = false }: {
  nickname: string;
  emoji: string | null;
  mundiales?: number;
  campeon?: boolean;
}) {
  return (
    <span>
      {emoji ? `${emoji} ` : ""}
      <span className={campeon ? "font-semibold text-gold" : undefined}>{nickname}</span>
      {mundiales > 0 && <Stars n={mundiales} campeon={campeon} />}
    </span>
  );
}

// Estrellitas de mundiales al final del nombre
export function Stars({ n, campeon = false }: { n: number; campeon?: boolean }) {
  const title = `${n} ${n === 1 ? "mundial" : "mundiales"}${campeon ? " · campeón del mundo vigente" : ""}`;
  return (
    <span title={title} aria-label={title} className="ml-1 align-super text-[0.55em] tracking-tight text-gold">
      {"★".repeat(n)}
    </span>
  );
}

// El campeón vigente va en dorado. Se rellena al cargar la liga, para los nombres que llegan como texto.
let campeones: string[] = [];
export function marcarCampeones(nicknames: string[]) {
  campeones = nicknames;
}

// Para nombres que ya vienen en texto ("Adolf Victimilla ★★"): pinta las estrellas pequeñas
export function Starred({ name }: { name: string }) {
  const m = name.match(/^(.*?)\s*(★+)$/);
  const texto = m ? m[1] : name;
  const oro = campeones.some((c) => texto.includes(c));
  return (
    <>
      {oro ? <span className="font-semibold text-gold">{texto}</span> : texto}
      {m && <Stars n={m[2].length} />}
    </>
  );
}
