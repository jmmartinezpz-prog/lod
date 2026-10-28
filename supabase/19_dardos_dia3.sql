-- ============================================================
-- LOD · El día 3 entero fue de dardos: J23 ya lo tenía, faltaban J24 y J25.
-- (J25 sigue siendo de sobrantes: saldrá con las dos etiquetas.)
-- Pegar en Supabase → SQL Editor → Run. Se puede repetir.
-- ============================================================

update jornadas set game = 'dardos' where number in (24, 25) and game <> 'dardos';

-- Comprobación: tienen que salir J23, J24 y J25 con dardos
select number, kind, game from jornadas where number between 23 and 25 order by number;
