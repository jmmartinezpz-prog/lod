-- ============================================================
-- LOD · Cada llave es de un jugador: las stats se abren con
-- "lo tuyo" por defecto. El admin también elige quién es.
-- Pegar en Supabase → SQL Editor → Run (después de 15). Se puede repetir.
-- ============================================================

alter table llaves add column if not exists player_id uuid references players(id) on delete set null;
alter table admins add column if not exists player_id uuid references players(id) on delete set null;

drop policy if exists "admin elige jugador" on admins;
create policy "admin elige jugador" on admins for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function quien_soy() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'admin', is_admin(),
    'llave', (select nombre from llaves where id = llave_actual()),
    'jugador', coalesce(
      (select player_id from llaves where id = llave_actual()),
      (select player_id from admins where user_id = auth.uid())
    )
  );
$$;

drop function if exists crear_llave(text);
create or replace function crear_llave(p_nombre text, p_player uuid default null) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789X';
  b bytea := gen_random_bytes(8);
  s text := '';
  code text;
begin
  if not is_admin() then raise exception 'Solo el admin puede crear llaves'; end if;
  for i in 0..7 loop
    s := s || substr(abc, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  code := 'LOD-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
  insert into llaves (nombre, hash, player_id) values (trim(p_nombre), encode(digest(code, 'sha256'), 'hex'), p_player);
  return code;
end $$;
