-- ============================================================
-- LOD · La liga es solo el reflejo del modo juego. Nadie (ni el
-- admin desde la app) puede borrar ni cambiar jornadas, resultados,
-- piscinas, días, jugadores, partidas ni periódicos.
--   · Lo único que se escribe a mano: sanciones nuevas (con llave).
--   · Una partida se puede cancelar mientras se juega; una vez
--     terminada ya es parte de la liga y no se puede anular.
--   · Arreglos de emergencia: solo desde el panel de Supabase
--     (SQL Editor / Table Editor), que no pasa por estas reglas.
-- Pegar en Supabase → SQL Editor → Run (después de 14). Se puede repetir.
-- ============================================================

-- ---------- 1. Liga: sin escritura desde la app ----------
do $$
declare t text;
begin
  foreach t in array array['players','jornadas','results','adjustments','events','league','dias'] loop
    execute format('drop policy if exists "escritura admin" on %I', t);
  end loop;
  -- Modo juego: se juega (alta y cambios con las reglas antitrampa), no se borra
  foreach t in array array['partidas','partida_jugadores','partida_movimientos'] loop
    execute format('drop policy if exists "borrado admin" on %I', t);
  end loop;
end $$;

-- Sanciones: se pueden poner, no quitar ni cambiar
drop policy if exists "sanciones con llave" on adjustments;
create policy "sanciones con llave" on adjustments for insert
  with check ((select puede_apuntar()) and kind = 'sancion');

-- Periódicos: se suben, no se borran
drop policy if exists "periodicos borrar" on periodicos;

-- ---------- 2. Partidas: terminada = intocable ----------
create or replace function antitrampa_partidas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Desde el panel de Supabase (no la API de la app) se puede todo: arreglos de emergencia
  if session_user <> 'authenticator' then return new; end if;
  if tg_op = 'INSERT' then
    if new.started_at > now() + interval '1 hour' or new.started_at < now() - interval '2 days' then
      raise exception 'Fecha de partida no válida';
    end if;
    return new;
  end if;
  if new.started_at is distinct from old.started_at or new.start_lives is distinct from old.start_lives or new.kind is distinct from old.kind then
    raise exception 'Una partida empezada no se puede cambiar';
  end if;
  if old.ended_at is not null and new.cancelada and not old.cancelada then
    raise exception 'Una partida terminada ya es parte de la liga y no se puede anular';
  end if;
  if old.cancelada and not new.cancelada and not is_admin() then
    raise exception 'Solo el admin puede recuperar una partida anulada';
  end if;
  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'La partida ya estaba cerrada';
  end if;
  return new;
end $$;
