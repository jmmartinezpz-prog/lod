-- ============================================================
-- LOD · Modo juego: piscinas y BUST
-- Pegar en Supabase → SQL Editor → Run (después de 03_juego.sql)
-- ============================================================

-- Tipo de movimiento: vida normal o piscina (con quién la lanzó)
alter table partida_movimientos
  add column if not exists kind text not null default 'vida' check (kind in ('vida','piscina')),
  add column if not exists from_jugador_id uuid references partida_jugadores(id) on delete cascade;

-- lives_after = -1 significa BUST (eliminado); 0 es la vida cero
alter table partida_movimientos drop constraint if exists partida_movimientos_lives_after_check;
alter table partida_movimientos add constraint partida_movimientos_lives_after_check check (lives_after >= -1);
