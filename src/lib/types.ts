export type Player = {
  id: string;
  nickname: string;
  emoji: string | null;
  is_wildcard: boolean;
  active: boolean;
  seat_order: number | null;
};

export type JornadaKind = "normal" | "sobrante";

export type Jornada = {
  id: string;
  number: number;
  played_on: string;
  kind: JornadaKind;
  game: string;
  notes: string | null;
};

export type Result = {
  id: string;
  jornada_id: string;
  player_id: string;
  position: number;
  points: number;
};

export type Adjustment = {
  id: string;
  player_id: string;
  kind: "arrastre" | "sancion" | "bonus" | "alta";
  points: number;
  reason: string | null;
  jornada_id: string | null;
  created_at: string;
};

export type LeagueEvent = {
  id: string;
  player_id: string;
  kind: "piscina" | "autopiscina" | "historia";
  value: number;
  description: string | null;
  jornada_id: string | null;
  created_at: string;
};

export type League = {
  name: string;
  total_jornadas: number;
  jornadas_previas: number;
};
