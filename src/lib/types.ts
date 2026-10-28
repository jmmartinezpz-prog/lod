export type Player = {
  id: string;
  nickname: string;
  emoji: string | null;
  is_wildcard: boolean;
  active: boolean;
  seat_order: number | null;
  mundiales?: number; // estrellas junto al nombre (07_mundiales.sql)
  campeon?: boolean; // campeón del mundo vigente
};

export type JornadaKind = "normal" | "sobrante";

export type Dia = {
  id: string;
  number: number;
  played_on: string | null;
  notes: string | null;
};

export type Jornada = {
  id: string;
  number: number;
  dia_id: string | null;
  played_on: string; // en el histórico J1–J45 se rellena al poner la fecha del día
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
  target_player_id: string | null;
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
