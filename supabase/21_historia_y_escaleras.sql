-- ============================================================
-- LOD · En el modo juego también se apuntan puntos de historia y
-- escaleras (tiradas y remadas). Los puntos de historia pasan a la
-- liga con la jornada; las escaleras son solo para las estadísticas.
-- Pegar en Supabase → SQL Editor → Run (después de 20). Se puede repetir.
-- ============================================================

alter table partida_movimientos drop constraint if exists partida_movimientos_kind_check;
alter table partida_movimientos add constraint partida_movimientos_kind_check
  check (kind in ('vida', 'piscina', 'historia', 'escalera_tirada', 'escalera_remada'));

-- Igual que en 13_liga_desde_juego.sql, con dos cambios: las vidas solo miran
-- movimientos de vidas y piscinas, y los puntos de historia pasan a la liga.
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
        where jugador_id = pj.id and kind in ('vida', 'piscina') order by created_at desc limit 1
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

  -- Puntos de historia
  insert into events (player_id, kind, value, jornada_id, created_at)
  select pj.player_id, 'historia', 1, j_id, m.created_at
  from partida_movimientos m
  join partida_jugadores pj on pj.id = m.jugador_id
  where m.partida_id = p_id and m.kind = 'historia' and pj.player_id is not null;

  update partidas set en_liga = true where id = p_id and not en_liga;
  return j_num;
end $$;
