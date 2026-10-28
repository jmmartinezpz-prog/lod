-- ============================================================
-- LOD · Mundiales: estrellas junto al nombre
-- Pegar en Supabase → SQL Editor → Run
-- ============================================================

alter table players
  add column if not exists mundiales int not null default 0 check (mundiales >= 0),
  add column if not exists campeon boolean not null default false;  -- campeón del mundo vigente

update players set mundiales = 2 where nickname = 'Adolf Victimilla';
update players set mundiales = 1, campeon = true where nickname = 'Super Sapiens';

-- Solo puede haber un campeón vigente
update players set campeon = false where nickname <> 'Super Sapiens';
