-- ============================================================
-- LOD · Modo juego: partidas con contador de vidas
-- Pegar en Supabase → SQL Editor → Run (después de 01 y 02)
-- ============================================================

-- Una partida del modo juego (los ids los genera el móvil)
create table if not exists partidas (
  id          uuid primary key,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,                -- null = en curso o abandonada
  start_lives int not null check (start_lives > 0)
);

-- Quién juega cada partida
create table if not exists partida_jugadores (
  id         uuid primary key,
  partida_id uuid not null references partidas(id) on delete cascade,
  player_id  uuid references players(id) on delete set null,  -- null = wildcard escrito a mano
  name       text not null,
  color      text not null,
  seat       int  not null
);

-- Cada vida quitada o sumada
create table if not exists partida_movimientos (
  id          uuid primary key,
  partida_id  uuid not null references partidas(id) on delete cascade,
  jugador_id  uuid not null references partida_jugadores(id) on delete cascade,
  delta       int  not null,
  lives_after int  not null check (lives_after >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists partida_movimientos_partida on partida_movimientos (partida_id, created_at);

-- Seguridad: cualquiera puede leer y apuntar partidas (el modo juego no
-- pide login), pero solo el admin puede borrarlas.
do $$
declare t text;
begin
  foreach t in array array['partidas','partida_jugadores','partida_movimientos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on %I', t);
    execute format('drop policy if exists "alta publica" on %I', t);
    execute format('drop policy if exists "cambio publico" on %I', t);
    execute format('drop policy if exists "borrado admin" on %I', t);
    execute format('create policy "lectura publica" on %I for select using (true)', t);
    execute format('create policy "alta publica" on %I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "cambio publico" on %I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "borrado admin" on %I for delete to authenticated using (true)', t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
