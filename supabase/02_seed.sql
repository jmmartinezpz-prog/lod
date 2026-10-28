-- ============================================================
-- Datos iniciales: situación tras la jornada 35
-- Pegar en Supabase → SQL Editor → Run (después de 01_schema.sql)
-- ============================================================

update league set jornadas_previas = 35 where id = 1;

insert into players (nickname, emoji, is_wildcard, seat_order) values
  ('Super Sapiens',            '👑', false, 3),
  ('Il Cazatore',              null, false, 4),
  ('Anitín Poceiro',           null, false, 1),
  ('Adolf Victimilla',         null, false, 2),
  ('El Judío Supremo',         null, false, null),
  ('El Gaitero de Ortigueira', null, true,  null),
  ('Guerritas Maduro',         null, true,  null)
on conflict (nickname) do nothing;

-- Puntos acumulados hasta J35 (ya incluyen la sanción de -4 de Super Sapiens
-- y los 15 puntos de alta de El Judío Supremo)
insert into adjustments (player_id, kind, points, reason)
select id, 'arrastre', pts, 'Clasificación acumulada hasta J35'
from players join (values
  ('Super Sapiens', 96),
  ('Il Cazatore', 93),
  ('Anitín Poceiro', 86),
  ('Adolf Victimilla', 77),
  ('El Judío Supremo', 70)
) as v(nick, pts) on v.nick = players.nickname;

-- Puntos de historia acumulados
insert into events (player_id, kind, value, description)
select id, 'historia', val, 'Acumulado hasta J35'
from players join (values
  ('Anitín Poceiro', 3),
  ('Il Cazatore', 1),
  ('Super Sapiens', 1)
) as v(nick, val) on v.nick = players.nickname;
