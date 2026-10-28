-- ============================================================
-- LOD · Los periódicos subidos desde la app, con la numeración de días
-- nueva (después de 22_dias_1_2_3.sql los días se corrieron dos números).
-- Pegar en Supabase → SQL Editor → Run. Se puede repetir (toma el número del día de su fecha).
-- ============================================================

update periodicos p set dia_number = d.number
from dias d
where d.played_on = p.fecha and p.dia_number is distinct from d.number;

select titulo, fecha, dia_number from periodicos order by fecha;
