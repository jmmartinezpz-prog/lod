-- ============================================================
-- LOD · Road to Napicol 2027 — esquema de base de datos
-- Pegar entero en Supabase → SQL Editor → Run
-- ============================================================

-- Jugadores (fijos y wildcards)
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  nickname    text not null unique,
  emoji       text,
  is_wildcard boolean not null default false,
  active      boolean not null default true,
  seat_order  int,                       -- orden de mesa (null = sin sitio fijo)
  created_at  timestamptz not null default now()
);

-- Jornadas
create table if not exists jornadas (
  id         uuid primary key default gen_random_uuid(),
  number     int  not null unique,       -- nº de jornada (1..200)
  played_on  date not null default current_date,
  kind       text not null default 'normal' check (kind in ('normal','sobrante')),
  game       text not null default 'dados',  -- dados, dardos...
  notes      text,
  created_at timestamptz not null default now()
);

-- Resultado de cada jugador en cada jornada
create table if not exists results (
  id         uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references jornadas(id) on delete cascade,
  player_id  uuid not null references players(id)  on delete restrict,
  position   int  not null check (position >= 1),
  points     int  not null,
  unique (jornada_id, player_id),
  unique (jornada_id, position)
);

-- Ajustes de puntos de liga: arrastre histórico, sanciones, bonus
create table if not exists adjustments (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete restrict,
  kind       text not null check (kind in ('arrastre','sancion','bonus','alta')),
  points     int  not null,
  reason     text,
  jornada_id uuid references jornadas(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Eventos que NO suman puntos de liga: piscinas, autopiscinas, puntos de historia
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete restrict,
  kind       text not null check (kind in ('piscina','autopiscina','historia')),
  value      int  not null default 1,
  description text,
  jornada_id uuid references jornadas(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Configuración general
create table if not exists league (
  id             int primary key default 1 check (id = 1),
  name           text not null default 'Road to Napicol 2027',
  total_jornadas int  not null default 200,
  jornadas_previas int not null default 0   -- jornadas jugadas antes de la app
);
insert into league (id) values (1) on conflict do nothing;

-- ============================================================
-- Seguridad (RLS): todo el mundo puede LEER, solo usuarios
-- logueados pueden ESCRIBIR. Desactiva el registro público en
-- Authentication → Sign In / Providers para que solo existas tú.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['players','jornadas','results','adjustments','events','league'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on %I', t);
    execute format('drop policy if exists "escritura admin" on %I', t);
    execute format('create policy "lectura publica" on %I for select using (true)', t);
    execute format('create policy "escritura admin" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Realtime: la clasificación se actualiza sola en todos los móviles
do $$
declare t text;
begin
  foreach t in array array['jornadas','results','adjustments','events'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
