-- ============================================================
-- LOD · La liga sale del modo juego.
--   · Al terminar una partida se crea sola su jornada: resultados,
--     puntos y piscinas. Nadie mete jornadas a mano.
--   · Con llave: jugar partidas, anularlas, poner sanciones y
--     subir periódicos.
--   · Solo el admin: panel 🛡 (llaves, registro, correcciones).
--   · Llaves más cortas: LOD-XXXX-XXXX (las viejas siguen valiendo).
-- Pegar en Supabase → SQL Editor → Run (después de 12_seguridad.sql).
-- Se puede ejecutar más de una vez.
-- ============================================================

alter table jornadas add column if not exists partida_id uuid unique references partidas(id) on delete set null;
alter table partidas add column if not exists en_liga boolean not null default false;

-- ---------- 1. Permisos ----------
do $$
declare t text;
begin
  -- Liga: solo el admin (las jornadas las crea la propia partida)
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias'] loop
    execute format('drop policy if exists "escritura admin" on %I', t);
    execute format('create policy "escritura admin" on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
  -- Modo juego: con llave se juega y se anula; borrar, solo admin
  foreach t in array array['partidas','partida_jugadores','partida_movimientos'] loop
    execute format('drop policy if exists "borrado admin" on %I', t);
    execute format('create policy "borrado admin" on %I for delete using (is_admin())', t);
  end loop;
end $$;

-- Sanciones: también con llave (bonus, altas y arrastres, solo admin)
drop policy if exists "sanciones con llave" on adjustments;
create policy "sanciones con llave" on adjustments for all
  using (puede_apuntar() and kind = 'sancion') with check (puede_apuntar() and kind = 'sancion');

drop policy if exists "periodicos borrar" on periodicos;
create policy "periodicos borrar" on periodicos for delete using (puede_apuntar());

-- ---------- 2. De partida a jornada ----------
-- Misma tabla que la app: con 4 jugadores la de 4; con cualquier otro número, la de 5
create or replace function puntos_liga(p_kind text, p_n int, p_puesto int) returns int
language sql immutable as $$
  select coalesce((case
    when p_n = 4 and p_kind = 'sobrante' then array[7,4,2,0]
    when p_n = 4 then array[4,2,1,0]
    when p_kind = 'sobrante' then array[9,6,4,2,0]
    else array[5,3,2,1,0] end)[p_puesto], 0);
$$;

-- Crea la jornada de una partida terminada. Devuelve su número (o null si no toca).
create or replace function partida_a_liga(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p partidas;
  dia date;
  d_id uuid;
  j_id uuid;
  j_num int;
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('lod-liga'));
  select * into p from partidas where id = p_id;
  if p.id is null or p.ended_at is null or p.cancelada then return null; end if;
  select number into j_num from jornadas where partida_id = p_id;
  if found then return j_num; end if;

  -- Día de juego: hasta las 6:00 cuenta como el día anterior
  dia := ((p.started_at at time zone 'Europe/Madrid') - interval '6 hours')::date;
  select id into d_id from dias where played_on = dia order by number limit 1;
  if d_id is null then
    insert into dias (number, played_on) values ((select coalesce(max(number), 0) + 1 from dias), dia) returning id into d_id;
  end if;

  select coalesce(max(number), 0) + 1 into j_num from jornadas;
  insert into jornadas (number, dia_id, played_on, kind, game, partida_id)
  values (j_num, d_id, dia, p.kind, 'dados', p_id) returning id into j_id;

  select count(*) into n from partida_jugadores where partida_id = p_id;

  -- Clasificación: vivos por vidas; luego los reventados, del último en caer al primero
  insert into results (jornada_id, player_id, position, points)
  select j_id, player_id, puesto, puntos_liga(p.kind, n, puesto)
  from (
    select f.player_id,
           (row_number() over (order by (f.vidas >= 0) desc,
                                        case when f.vidas >= 0 then f.vidas end desc,
                                        case when f.vidas < 0 then f.cuando end desc,
                                        f.seat))::int as puesto
    from (
      select pj.player_id, pj.seat, coalesce(u.lives_after, p.start_lives) as vidas, u.created_at as cuando
      from partida_jugadores pj
      left join lateral (
        select lives_after, created_at from partida_movimientos
        where jugador_id = pj.id order by created_at desc limit 1
      ) u on true
      where pj.partida_id = p_id
    ) f
  ) o
  where player_id is not null;

  -- Piscinas de la partida (quien la lanza → a quien le cae)
  insert into events (player_id, kind, target_player_id, value, jornada_id, created_at)
  select t.player_id, case when t.id = v.id then 'autopiscina' else 'piscina' end, v.player_id, 1, j_id, m.created_at
  from partida_movimientos m
  join partida_jugadores t on t.id = m.from_jugador_id
  left join partida_jugadores v on v.id = m.jugador_id
  where m.partida_id = p_id and m.kind = 'piscina' and t.player_id is not null;

  update partidas set en_liga = true where id = p_id and not en_liga;
  return j_num;
end $$;

-- Lo llama el móvil al terminar la partida
create or replace function cerrar_partida(p_id uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
begin
  if not puede_apuntar() then raise exception 'Hace falta llave para guardar la partida'; end if;
  return partida_a_liga(p_id);
end $$;

-- Anular una partida quita su jornada; si el admin la recupera, vuelve
create or replace function partida_cancelada_liga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cancelada and not old.cancelada then
    delete from events where jornada_id in (select id from jornadas where partida_id = new.id);
    delete from jornadas where partida_id = new.id;
  elsif old.cancelada and not new.cancelada and new.en_liga then
    perform partida_a_liga(new.id);
  end if;
  return null;
end $$;
drop trigger if exists liga on partidas;
create trigger liga after update of cancelada on partidas for each row execute function partida_cancelada_liga();

-- ---------- 3. Llaves cortas, sin letras que se confunden (0/O, 1/I/L) ----------
create or replace function crear_llave(p_nombre text) returns text
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
  insert into llaves (nombre, hash) values (trim(p_nombre), encode(digest(code, 'sha256'), 'hex'));
  return code;
end $$;
