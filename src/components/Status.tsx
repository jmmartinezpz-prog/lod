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

export function PlayerName({ nickname, emoji }: { nickname: string; emoji: string | null }) {
  return (
    <span>
      {emoji ? `${emoji} ` : ""}
      {nickname}
    </span>
  );
}
