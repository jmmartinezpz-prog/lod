-- ============================================================
-- LOD · Seguridad: admins con nombre, llaves por persona,
-- registro de cambios y reglas antitrampa.
-- Pegar en Supabase → SQL Editor → Run
--
-- Ejecutar después de 11_prensa.sql.
-- ANTES: en Authentication → Sign In / Providers desactiva
-- "Allow new users to sign up". Este script hace admin a todos
-- los usuarios que existan ahora mismo (debería ser solo tu cuenta).
-- ============================================================

-- Por si faltara alguna migración anterior del modo juego
alter table partidas add column if not exists kind text not null default 'normal';
alter table partidas add column if not exists cancelada boolean not null default false;

-- ---------- 1. Admins ----------
create table if not exists admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
drop policy if exists "admins se ven" on admins;
create policy "admins se ven" on admins for select using (user_id = auth.uid());

insert into admins (user_id) select id from auth.users on conflict do nothing;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ---------- 2. Llaves (una por persona) ----------
create table if not exists llaves (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  hash text not null unique,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz
);
alter table llaves enable row level security;
drop policy if exists "llaves admin" on llaves;
create policy "llaves admin" on llaves for select using (is_admin());
drop policy if exists "llaves admin cambia" on llaves;
create policy "llaves admin cambia" on llaves for update using (is_admin()) with check (is_admin());
drop policy if exists "llaves admin borra" on llaves;
create policy "llaves admin borra" on llaves for delete using (is_admin());

-- La llave viaja en la cabecera x-lod-llave de cada petición de la app
create or replace function llave_actual() returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v text;
  r uuid;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-lod-llave';
  if v is null or length(v) < 8 then return null; end if;
  select id into r from llaves where hash = encode(digest(upper(trim(v)), 'sha256'), 'hex') and activa;
  return r;
end $$;

create or replace function puede_apuntar() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or llave_actual() is not null;
$$;

-- Quién soy para la app: nombre de la llave y si soy admin
create or replace function quien_soy() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'admin', is_admin(),
    'llave', (select nombre from llaves where id = llave_actual())
  );
$$;

-- Crea una llave y devuelve el código UNA sola vez (solo se guarda su huella)
create or replace function crear_llave(p_nombre text) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  hx text := upper(encode(gen_random_bytes(6), 'hex'));
  code text;
begin
  if not is_admin() then raise exception 'Solo el admin puede crear llaves'; end if;
  code := 'LOD-' || substr(hx, 1, 4) || '-' || substr(hx, 5, 4) || '-' || substr(hx, 9, 4);
  insert into llaves (nombre, hash) values (trim(p_nombre), encode(digest(code, 'sha256'), 'hex'));
  return code;
end $$;

create or replace function quien() returns text
language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  if is_admin() then return 'admin ' || coalesce(auth.jwt() ->> 'email', ''); end if;
  select nombre into n from llaves where id = llave_actual();
  return coalesce('🔑 ' || n, 'sin llave');
end $$;

-- ---------- 3. Permisos de escritura ----------
do $$
declare t text;
begin
  -- Liga: solo admins de la lista (antes valía cualquier usuario logueado)
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias'] loop
    execute format('drop policy if exists "escritura admin" on %I', t);
    execute format('create policy "escritura admin" on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
  -- Modo juego: hace falta llave (o ser admin); borrar, solo admin
  foreach t in array array['partidas','partida_jugadores','partida_movimientos'] loop
    execute format('drop policy if exists "alta publica" on %I', t);
    execute format('drop policy if exists "cambio publico" on %I', t);
    execute format('drop policy if exists "borrado admin" on %I', t);
    execute format('create policy "alta publica" on %I for insert with check (puede_apuntar())', t);
    execute format('create policy "cambio publico" on %I for update using (puede_apuntar()) with check (puede_apuntar())', t);
    execute format('create policy "borrado admin" on %I for delete using (is_admin())', t);
  end loop;
end $$;

drop policy if exists "periodicos subir" on periodicos;
create policy "periodicos subir" on periodicos for insert with check (puede_apuntar());
drop policy if exists "periodicos borrar" on periodicos;
create policy "periodicos borrar" on periodicos for delete using (is_admin());

-- ---------- 4. Reglas antitrampa (el admin se las salta) ----------
create or replace function antitrampa_partidas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.started_at > now() + interval '1 hour' or new.started_at < now() - interval '2 days' then
      raise exception 'Fecha de partida no válida';
    end if;
    return new;
  end if;
  if new.started_at is distinct from old.started_at or new.start_lives is distinct from old.start_lives or new.kind is distinct from old.kind then
    raise exception 'Una partida empezada no se puede cambiar';
  end if;
  if old.cancelada and not new.cancelada then raise exception 'Solo el admin puede recuperar una partida anulada'; end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then raise exception 'La partida ya estaba cerrada'; end if;
  return new;
end $$;
drop trigger if exists antitrampa on partidas;
create trigger antitrampa before insert or update on partidas for each row execute function antitrampa_partidas();

create or replace function antitrampa_jugadores() returns trigger
language plpgsql security definer set search_path = public as $$
declare p partidas;
begin
  if is_admin() then return new; end if;
  if tg_op = 'UPDATE' then
    if new is distinct from old then raise exception 'Los jugadores de una partida no se pueden cambiar'; end if;
    return new;
  end if;
  select * into p from partidas where id = new.partida_id;
  if p.id is null or p.cancelada or p.started_at < now() - interval '2 days' then
    raise exception 'No se pueden añadir jugadores a esta partida';
  end if;
  return new;
end $$;
drop trigger if exists antitrampa on partida_jugadores;
create trigger antitrampa before insert or update on partida_jugadores for each row execute function antitrampa_jugadores();

create or replace function antitrampa_movimientos() returns trigger
language plpgsql security definer set search_path = public as $$
declare p partidas;
begin
  if is_admin() then return new; end if;
  if tg_op = 'UPDATE' then
    if new is distinct from old then raise exception 'Un movimiento apuntado no se puede cambiar'; end if;
    return new;
  end if;
  select * into p from partidas where id = new.partida_id;
  if p.id is null or p.cancelada or p.started_at < now() - interval '2 days' then
    raise exception 'Esta partida ya no admite movimientos';
  end if;
  if new.created_at > now() + interval '10 minutes'
     or new.created_at < p.started_at - interval '1 minute'
     or (p.ended_at is not null and new.created_at > p.ended_at + interval '5 minutes') then
    raise exception 'Movimiento fuera de la partida';
  end if;
  if not exists (select 1 from partida_jugadores where id = new.jugador_id and partida_id = new.partida_id) then
    raise exception 'Ese jugador no está en la partida';
  end if;
  return new;
end $$;
drop trigger if exists antitrampa on partida_movimientos;
create trigger antitrampa before insert or update on partida_movimientos for each row execute function antitrampa_movimientos();

-- ---------- 5. Registro de cambios ----------
create table if not exists auditoria (
  id bigserial primary key,
  cuando timestamptz not null default now(),
  tabla text not null,
  op text not null,
  fila text,
  quien text not null,
  antes jsonb,
  despues jsonb
);
create index if not exists auditoria_cuando on auditoria (cuando desc);
alter table auditoria enable row level security;
drop policy if exists "auditoria admin" on auditoria;
create policy "auditoria admin" on auditoria for select using (is_admin());

create or replace function auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'html' end;
  d jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'html' end;
  k uuid := llave_actual();
begin
  if tg_op = 'UPDATE' and a = d then return null; end if; -- reenvíos idénticos del modo juego
  insert into auditoria (tabla, op, fila, quien, antes, despues)
  values (tg_table_name, tg_op, coalesce(d ->> 'id', a ->> 'id'), quien(), a, d);
  if k is not null and tg_table_name <> 'llaves' then update llaves set ultimo_uso = now() where id = k; end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias',
                           'partidas','partida_jugadores','partida_movimientos','periodicos','llaves'] loop
    execute format('drop trigger if exists auditar on %I', t);
    execute format('create trigger auditar after insert or update or delete on %I for each row execute function auditar()', t);
  end loop;
end $$;

alter publication supabase_realtime add table auditoria;

-- Comprobación: tienes que salir tú
select u.email from admins a join auth.users u on u.id = a.user_id;
