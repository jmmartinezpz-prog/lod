-- ============================================================
-- LOD · Sin llave no se ve nada.
--   · Leer cualquier dato exige llave (o ser admin).
--   · El tiempo real no lleva la llave: en su lugar hay una tabla
--     pública "cambios" que solo dice QUÉ tabla ha cambiado; la app
--     la escucha y recarga los datos con su llave.
-- Pegar en Supabase → SQL Editor → Run (después de 13). Se puede repetir.
-- ============================================================

-- ---------- 1. Lectura solo con llave ----------
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias',
                           'partidas','partida_jugadores','partida_movimientos','periodicos'] loop
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy %I on %I', r.policyname, t);
    end loop;
    -- (select …) hace que se compruebe una vez por consulta, no fila a fila
    execute format('create policy "lectura con llave" on %I for select using ((select puede_apuntar()))', t);
  end loop;
end $$;

-- ---------- 2. Avisos de cambios para el tiempo real ----------
create table if not exists cambios (
  tabla text primary key,
  cuando timestamptz not null default now()
);
alter table cambios enable row level security;
drop policy if exists "cambios publicos" on cambios;
create policy "cambios publicos" on cambios for select using (true);

create or replace function avisar_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into cambios (tabla, cuando) values (tg_table_name, clock_timestamp())
  on conflict (tabla) do update set cuando = excluded.cuando;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias',
                           'partidas','partida_jugadores','partida_movimientos','periodicos'] loop
    execute format('drop trigger if exists avisar on %I', t);
    execute format('create trigger avisar after insert or update or delete on %I for each statement execute function avisar_cambio()', t);
  end loop;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cambios') then
    alter publication supabase_realtime add table cambios;
  end if;
end $$;
