-- ============================================================
-- LOD · Separar el antiguo "día 1" en tres días de 6 jornadas:
--   J1–J6 → día 1 · J7–J12 → día 2 · J13–J18 → día 3
-- y correr los demás días dos números (el 2 pasa a 4, el 3 a 5…).
-- Pegar en Supabase → SQL Editor.
--
-- 1) Ejecuta primero SOLO este SELECT para ver cómo está ahora:
-- ============================================================

select d.number as dia, d.played_on, min(j.number) as desde, max(j.number) as hasta, count(j.id) as jornadas
from dias d left join jornadas j on j.dia_id = d.id
group by d.id order by d.number;

-- ============================================================
-- 2) Si el día 1 va de J1 a J18, ejecuta el bloque de abajo.
--    Si no, para: no hace nada y avisa (cuéntaselo a Claude).
-- ============================================================

do $$
declare
  viejo dias;
  fuera int;
  d1 uuid;
  d2 uuid;
begin
  select * into viejo from dias where number = 1;
  if viejo.id is null then raise exception 'No hay día 1'; end if;
  -- Si el día 1 ya solo tiene J1–J6, esto ya se hizo: no correr los días otra vez
  if not exists (select 1 from jornadas where dia_id = viejo.id and number between 7 and 18) then
    raise exception 'El día 1 ya está separado: no toco nada';
  end if;
  select count(*) into fuera from jornadas where dia_id = viejo.id and number not between 1 and 18;
  if fuera > 0 then raise exception 'El día 1 tiene % jornadas fuera de J1–J18: no toco nada', fuera; end if;

  -- Correr todos los días dos puestos (en dos pasos para no chocar con los números)
  update dias set number = number + 1000;
  update dias set number = number - 1000 + 2;

  -- El antiguo día 1 (ahora 3) se queda con J13–J18; J1–J6 y J7–J12 a días nuevos
  insert into dias (number, played_on) values (1, null) returning id into d1;
  insert into dias (number, played_on) values (2, null) returning id into d2;
  update jornadas set dia_id = d1 where dia_id = viejo.id and number between 1 and 6;
  update jornadas set dia_id = d2 where dia_id = viejo.id and number between 7 and 12;
end $$;

-- 3) Comprobación: tiene que salir 1 (J1–J6), 2 (J7–J12), 3 (J13–J18), 4…
select d.number as dia, d.played_on, min(j.number) as desde, max(j.number) as hasta, count(j.id) as jornadas
from dias d left join jornadas j on j.dia_id = d.id
group by d.id order by d.number;
