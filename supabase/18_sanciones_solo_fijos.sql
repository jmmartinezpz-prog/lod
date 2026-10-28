-- ============================================================
-- LOD · Las sanciones son solo para los jugadores fijos de la liga
-- (nada de wildcards). Pegar en Supabase → SQL Editor → Run
-- (después de 17). Se puede repetir.
-- ============================================================

drop policy if exists "sanciones con llave" on adjustments;
create policy "sanciones con llave" on adjustments for insert
  with check (
    (select puede_apuntar())
    and kind = 'sancion'
    and exists (select 1 from players p where p.id = player_id and not p.is_wildcard)
  );
