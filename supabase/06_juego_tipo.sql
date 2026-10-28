-- ============================================================
-- LOD · Modo juego: tipo de partida (normal / sobrante) para los puntos
-- Pegar en Supabase → SQL Editor → Run (después de 05)
-- ============================================================

alter table partidas
  add column if not exists kind text not null default 'normal' check (kind in ('normal','sobrante'));
