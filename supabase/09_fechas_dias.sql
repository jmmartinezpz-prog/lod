-- ============================================================
-- LOD · Fechas de los días del histórico (J1–J45)
-- Pegar en Supabase → SQL Editor → Run
-- El trigger de 04_historico.sql copia la fecha a las jornadas de cada día.
-- ============================================================

update dias set played_on = v.fecha::date
from (values
  (1, '2026-09-22'),
  (2, '2026-09-30'),  -- aproximada
  (3, '2026-10-07'),
  (4, '2026-10-12'),
  (5, '2026-10-19'),
  (6, '2026-10-21'),
  (7, '2026-10-27')
) as v(num, fecha)
where dias.number = v.num;

-- Por si el trigger no estuviera creado: copia igualmente la fecha a las jornadas
update jornadas set played_on = d.played_on
from dias d
where jornadas.dia_id = d.id and jornadas.played_on is distinct from d.played_on;

-- Comprobación: cada día con su fecha y nº de jornadas
select d.number as dia, d.played_on, count(j.id) as jornadas
from dias d left join jornadas j on j.dia_id = d.id
group by d.number, d.played_on order by d.number;
