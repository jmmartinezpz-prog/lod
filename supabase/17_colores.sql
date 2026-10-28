-- ============================================================
-- LOD · Cada jugador tiene su color, el mismo en todos los móviles.
-- Solo cambia cuando alguien lo cambia con 🎨 en el modo juego.
-- Pegar en Supabase → SQL Editor → Run (después de 16). Se puede repetir.
-- ============================================================

alter table players add column if not exists color text check (color ~ '^#[0-9a-fA-F]{6}$');

-- La liga no se toca desde la app: esto solo cambia el color, y hace falta llave
create or replace function poner_color(p_player uuid, p_color text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not puede_apuntar() then raise exception 'Hace falta llave'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Color no válido'; end if;
  -- Un color, un jugador: si otro lo tenía, se queda sin él (y la app le da uno libre)
  update players set color = null where color = p_color and id <> p_player;
  update players set color = p_color where id = p_player and color is distinct from p_color;
end $$;
