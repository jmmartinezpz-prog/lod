-- ============================================================
-- LOD · Con llave se puede apuntar TODO (jornadas, extras,
-- partidas, periódicos). Solo el admin ve el panel 🛡: llaves,
-- registro de cambios y recuperar partidas anuladas.
-- Llaves nuevas más cortas: LOD-XXXX-XXXX (las viejas siguen valiendo).
-- Pegar en Supabase → SQL Editor → Run (después de 12_seguridad.sql)
-- ============================================================

do $$
declare t text;
begin
  -- Liga: ahora también con llave
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias'] loop
    execute format('drop policy if exists "escritura admin" on %I', t);
    execute format('create policy "escritura admin" on %I for all using (puede_apuntar()) with check (puede_apuntar())', t);
  end loop;
  -- Modo juego: borrar también con llave
  foreach t in array array['partidas','partida_jugadores','partida_movimientos'] loop
    execute format('drop policy if exists "borrado admin" on %I', t);
    execute format('create policy "borrado admin" on %I for delete using (puede_apuntar())', t);
  end loop;
end $$;

drop policy if exists "periodicos borrar" on periodicos;
create policy "periodicos borrar" on periodicos for delete using (puede_apuntar());

-- Llaves de 8 caracteres sin letras que se confunden (sin 0/O, 1/I/L)
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
