-- ============================================================
-- LOD · Quitar de la liga una partida terminada por error (una prueba).
-- Desde la app no se puede a propósito; esto solo desde el panel de Supabase.
--
-- 1) Cambia el 46 por el número de la jornada que creó la partida de prueba
--    (los dos sitios) y ejecuta SOLO el primer SELECT para comprobar que es esa.
-- 2) Ejecuta el bloque DO. La partida queda anulada: su jornada, resultados
--    y piscinas desaparecen de la liga y de las estadísticas.
-- ============================================================

-- 1) Comprobar
select j.number, j.played_on, p.started_at, p.ended_at,
       (select string_agg(pl.nickname || ' ' || r.position || 'º', ', ' order by r.position)
          from results r join players pl on pl.id = r.player_id where r.jornada_id = j.id) as resultado
from jornadas j join partidas p on p.id = j.partida_id
where j.number = 46;

-- 2) Quitar
do $$
declare
  j jornadas;
begin
  select * into j from jornadas where number = 46 and partida_id is not null;
  if j.id is null then raise exception 'Esa jornada no existe o no viene del modo juego'; end if;
  -- Anular la partida borra su jornada, resultados y piscinas (trigger de 13_liga_desde_juego.sql)
  update partidas set cancelada = true where id = j.partida_id;
  -- Si el día se ha quedado vacío, fuera también
  delete from dias d where d.id = j.dia_id and not exists (select 1 from jornadas x where x.dia_id = d.id);
end $$;
