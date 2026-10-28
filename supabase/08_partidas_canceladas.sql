-- ============================================================
-- LOD · Modo juego: partidas canceladas (pruebas, errores…)
-- No se borran: se marcan y las estadísticas las ignoran.
-- Pegar en Supabase → SQL Editor → Run
-- ============================================================

alter table partidas add column if not exists cancelada boolean not null default false;
