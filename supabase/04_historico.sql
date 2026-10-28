-- ============================================================
-- LOD · Histórico completo J1–J45 separado por días
-- Pegar entero en Supabase → SQL Editor → Run (después de 01, 02 y 03)
-- ⚠️ Borra jornadas, resultados, ajustes y eventos existentes y los
--    vuelve a cargar desde el histórico del chat.
-- ============================================================
begin;

-- 1) Estructura nueva: días de juego y destinatario de piscinas
create table if not exists dias (
  id         uuid primary key default gen_random_uuid(),
  number     int  not null unique,
  played_on  date,
  notes      text,
  created_at timestamptz not null default now()
);
alter table jornadas add column if not exists dia_id uuid references dias(id) on delete set null;
alter table jornadas alter column played_on drop not null;
alter table jornadas alter column played_on drop default;
alter table events add column if not exists target_player_id uuid references players(id) on delete restrict;

alter table dias enable row level security;
drop policy if exists "lectura publica" on dias;
drop policy if exists "escritura admin" on dias;
create policy "lectura publica" on dias for select using (true);
create policy "escritura admin" on dias for all to authenticated using (true) with check (true);
do $$ begin
  alter publication supabase_realtime add table dias;
exception when duplicate_object then null; end $$;

-- Al poner (o cambiar) la fecha de un día, se copia a todas sus jornadas
create or replace function sync_dia_fecha() returns trigger language plpgsql as $f$
begin
  update jornadas set played_on = new.played_on where dia_id = new.id;
  return new;
end $f$;
drop trigger if exists dias_sync_fecha on dias;
create trigger dias_sync_fecha after update of played_on on dias
  for each row execute function sync_dia_fecha();

-- 2) Limpiar datos previos (incluido el arrastre de J35)
delete from events;
delete from adjustments;
delete from results;
delete from jornadas;
delete from dias;
update league set jornadas_previas = 0 where id = 1;


-- 3) Días
insert into dias (number, notes) values
  (1, null),
  (2, 'Cumpleaños de Guerritas Maduro (wildcard)'),
  (3, 'Cumpleaños de Super Sapiens 👑 · primera jornada de la LOD con dardos'),
  (4, null),
  (5, null),
  (6, null),
  (7, null);

-- Códigos de jugador usados abajo
create temp table _p (code text primary key, id uuid) on commit drop;
insert into _p select c, (select id from players where nickname = n) from (values
  ('CUR', 'Super Sapiens'),
  ('CAZ', 'Il Cazatore'),
  ('POC', 'Anitín Poceiro'),
  ('ADO', 'Adolf Victimilla'),
  ('JUD', 'El Judío Supremo'),
  ('GAI', 'El Gaitero de Ortigueira'),
  ('MAD', 'Guerritas Maduro')) as v(c, n);

-- 4) Jornadas: (nº, día, tipo, juego, notas)
insert into jornadas (number, dia_id, kind, game, notes)
select n, (select id from dias where number = d), k, g, t from (values
  (1, 1, 'normal', 'dados', null),
  (2, 1, 'normal', 'dados', null),
  (3, 1, 'normal', 'dados', null),
  (4, 1, 'normal', 'dados', null),
  (5, 1, 'sobrante', 'dados', null),
  (6, 1, 'normal', 'dados', null),
  (7, 1, 'normal', 'dados', null),
  (8, 1, 'normal', 'dados', null),
  (9, 1, 'sobrante', 'dados', null),
  (10, 1, 'normal', 'dados', null),
  (11, 1, 'normal', 'dados', null),
  (12, 1, 'sobrante', 'dados', null),
  (13, 1, 'normal', 'dados', null),
  (14, 1, 'normal', 'dados', null),
  (15, 1, 'normal', 'dados', null),
  (16, 1, 'sobrante', 'dados', null),
  (17, 1, 'normal', 'dados', null),
  (18, 1, 'sobrante', 'dados', null),
  (19, 2, 'normal', 'dados', null),
  (20, 2, 'normal', 'dados', null),
  (21, 2, 'sobrante', 'dados', 'Cumpleaños de Guerritas Maduro (wildcard)'),
  (22, 2, 'normal', 'dados', null),
  (23, 3, 'normal', 'dardos', 'Primera jornada de la historia de la LOD con dardos'),
  (24, 3, 'normal', 'dados', null),
  (25, 3, 'sobrante', 'dados', null),
  (26, 4, 'normal', 'dados', null),
  (27, 4, 'normal', 'dados', null),
  (28, 4, 'sobrante', 'dados', null),
  (29, 4, 'normal', 'dados', null),
  (30, 4, 'normal', 'dados', null),
  (31, 4, 'sobrante', 'dados', null),
  (32, 5, 'normal', 'dados', null),
  (33, 5, 'normal', 'dados', null),
  (34, 5, 'sobrante', 'dados', null),
  (35, 5, 'normal', 'dados', null),
  (36, 6, 'normal', 'dados', null),
  (37, 6, 'normal', 'dados', null),
  (38, 6, 'sobrante', 'dados', null),
  (39, 6, 'normal', 'dados', null),
  (40, 6, 'normal', 'dados', null),
  (41, 6, 'sobrante', 'dados', null),
  (42, 7, 'normal', 'dados', null),
  (43, 7, 'normal', 'dados', null),
  (44, 7, 'sobrante', 'dados', null),
  (45, 7, 'normal', 'dados', null)
) as v(n, d, k, g, t);

-- 5) Resultados: (jornada, jugador, posición, puntos)
insert into results (jornada_id, player_id, position, points)
select j.id, p.id, pos, pts from (values
  (1,'POC',1,4), (1,'CUR',2,2), (1,'GAI',3,1), (1,'ADO',4,0), (1,'CAZ',5,0),
  (2,'POC',1,4), (2,'CUR',2,2), (2,'CAZ',3,1), (2,'GAI',4,0), (2,'ADO',5,0),
  (3,'CAZ',1,4), (3,'CUR',2,2), (3,'ADO',3,1), (3,'POC',4,0),
  (4,'POC',1,4), (4,'CUR',2,2), (4,'ADO',3,1), (4,'CAZ',4,0),
  (5,'CUR',1,7), (5,'CAZ',2,4), (5,'ADO',3,2), (5,'POC',4,0),
  (6,'POC',1,4), (6,'CAZ',2,2), (6,'CUR',3,1), (6,'ADO',4,0),
  (7,'CUR',1,4), (7,'CAZ',2,2), (7,'ADO',3,1), (7,'POC',4,0),
  (8,'POC',1,4), (8,'ADO',2,2), (8,'CAZ',3,1), (8,'CUR',4,0),
  (9,'CAZ',1,7), (9,'POC',2,4), (9,'ADO',3,2), (9,'CUR',4,0),
  (10,'ADO',1,4), (10,'POC',2,2), (10,'CAZ',3,1), (10,'CUR',4,0),
  (11,'ADO',1,4), (11,'CAZ',2,2), (11,'POC',3,1), (11,'CUR',4,0),
  (12,'ADO',1,7), (12,'CUR',2,4), (12,'POC',3,2), (12,'CAZ',4,0),
  (13,'CAZ',1,5), (13,'ADO',2,3), (13,'CUR',3,2), (13,'JUD',4,1), (13,'POC',5,0),
  (14,'JUD',1,5), (14,'POC',2,3), (14,'CUR',3,2), (14,'ADO',4,1), (14,'CAZ',5,0),
  (15,'CAZ',1,5), (15,'CUR',2,3), (15,'POC',3,2), (15,'JUD',4,1), (15,'ADO',5,0),
  (16,'ADO',1,9), (16,'JUD',2,6), (16,'POC',3,4), (16,'CAZ',4,2), (16,'CUR',5,0),
  (17,'ADO',1,5), (17,'JUD',2,3), (17,'POC',3,2), (17,'CUR',4,1), (17,'CAZ',5,0),
  (18,'CAZ',1,9), (18,'POC',2,6), (18,'CUR',3,4), (18,'ADO',4,2), (18,'JUD',5,0),
  (19,'CUR',1,5), (19,'POC',2,3), (19,'CAZ',3,2), (19,'ADO',4,1), (19,'JUD',5,0),
  (20,'CUR',1,5), (20,'JUD',2,3), (20,'CAZ',3,2), (20,'POC',4,1), (20,'ADO',5,0),
  (21,'MAD',1,9), (21,'CUR',2,6), (21,'CAZ',3,4), (21,'POC',4,2), (21,'JUD',5,0), (21,'ADO',6,0),
  (22,'JUD',1,5), (22,'MAD',2,0), (22,'CAZ',3,3), (22,'POC',4,2), (22,'ADO',5,1), (22,'CUR',6,0),
  (23,'JUD',1,5), (23,'CAZ',2,3), (23,'POC',3,2), (23,'ADO',4,1), (23,'CUR',5,0),
  (24,'CUR',1,5), (24,'CAZ',2,3), (24,'JUD',3,2), (24,'ADO',4,1), (24,'POC',5,0),
  (25,'CUR',1,9), (25,'ADO',2,6), (25,'JUD',3,4), (25,'POC',4,2), (25,'CAZ',5,0),
  (26,'JUD',1,5), (26,'CAZ',2,3), (26,'ADO',3,2), (26,'CUR',4,1), (26,'POC',5,0),
  (27,'ADO',1,5), (27,'JUD',2,3), (27,'POC',3,2), (27,'CUR',4,1), (27,'CAZ',5,0),
  (28,'CUR',1,9), (28,'POC',2,6), (28,'ADO',3,4), (28,'CAZ',4,2), (28,'JUD',5,0),
  (29,'CUR',1,5), (29,'POC',2,3), (29,'ADO',3,2), (29,'JUD',4,1), (29,'CAZ',5,0),
  (30,'CAZ',1,5), (30,'ADO',2,3), (30,'POC',3,2), (30,'JUD',4,1), (30,'CUR',5,0),
  (31,'POC',1,9), (31,'JUD',2,6), (31,'CAZ',3,4), (31,'CUR',4,2), (31,'ADO',5,0),
  (32,'CAZ',1,5), (32,'ADO',2,3), (32,'JUD',3,2), (32,'POC',4,1), (32,'CUR',5,0),
  (33,'CUR',1,5), (33,'CAZ',2,3), (33,'ADO',3,2), (33,'POC',4,1), (33,'JUD',5,0),
  (34,'CUR',1,9), (34,'CAZ',2,6), (34,'POC',3,4), (34,'JUD',4,2), (34,'ADO',5,0),
  (35,'CAZ',1,5), (35,'ADO',2,3), (35,'CUR',3,2), (35,'POC',4,1), (35,'JUD',5,0),
  (36,'ADO',1,5), (36,'POC',2,3), (36,'CAZ',3,2), (36,'JUD',4,1), (36,'CUR',5,0),
  (37,'ADO',1,5), (37,'JUD',2,3), (37,'POC',3,2), (37,'CAZ',4,1), (37,'CUR',5,0),
  (38,'CAZ',1,9), (38,'JUD',2,6), (38,'CUR',3,4), (38,'POC',4,2), (38,'ADO',5,0),
  (39,'ADO',1,5), (39,'CAZ',2,3), (39,'POC',3,2), (39,'CUR',4,1), (39,'JUD',5,0),
  (40,'CAZ',1,5), (40,'ADO',2,3), (40,'CUR',3,2), (40,'POC',4,1), (40,'JUD',5,0),
  (41,'POC',1,9), (41,'CUR',2,6), (41,'ADO',3,4), (41,'JUD',4,2), (41,'CAZ',5,0),
  (42,'JUD',1,5), (42,'CUR',2,3), (42,'ADO',3,2), (42,'CAZ',4,1), (42,'POC',5,0),
  (43,'ADO',1,5), (43,'CUR',2,3), (43,'CAZ',3,2), (43,'JUD',4,1), (43,'POC',5,0),
  (44,'CUR',1,9), (44,'POC',2,6), (44,'ADO',3,4), (44,'JUD',4,2), (44,'CAZ',5,0),
  (45,'CUR',1,5), (45,'POC',2,3), (45,'ADO',3,2), (45,'CAZ',4,1), (45,'JUD',5,0)
) as v(n, c, pos, pts)
join jornadas j on j.number = v.n join _p p on p.code = v.c;

-- 6) Piscinas y autopiscinas: (jornada, de, a, tipo)
insert into events (jornada_id, player_id, target_player_id, kind, value)
select j.id, p.id, t.id, k, 1 from (values
  (1,'POC','CAZ','piscina'), (1,'GAI','POC','piscina'), (2,'ADO','POC','piscina'), (4,'CUR','ADO','piscina'),
  (4,'POC','CAZ','piscina'), (4,'CUR','ADO','piscina'), (5,'CAZ','POC','piscina'), (6,'POC','CUR','piscina'),
  (6,'ADO','CAZ','piscina'), (7,'CUR','CAZ','piscina'), (9,'CUR','POC','piscina'), (9,'POC','CUR','piscina'),
  (9,'ADO','CAZ','piscina'), (9,'CAZ','POC','piscina'), (9,'POC','CAZ','piscina'), (10,'ADO','POC','piscina'),
  (11,'POC','CUR','piscina'), (11,'CAZ','POC','piscina'), (12,'POC','CAZ','piscina'), (12,'ADO','CAZ','piscina'),
  (12,'ADO','CAZ','piscina'), (12,'ADO','CAZ','piscina'), (12,'ADO','CUR','piscina'), (12,'ADO','ADO','autopiscina'),
  (13,'JUD','CAZ','piscina'), (13,'JUD','CAZ','piscina'), (13,'CAZ','JUD','piscina'), (13,'ADO','POC','piscina'),
  (14,'ADO','CAZ','piscina'), (14,'JUD','POC','piscina'), (15,'CUR','JUD','piscina'), (15,'CUR','POC','piscina'),
  (16,'ADO','CUR','piscina'), (16,'ADO','CAZ','piscina'), (17,'CAZ','POC','piscina'), (17,'POC','CAZ','piscina'),
  (17,'POC','CAZ','piscina'), (18,'POC','CAZ','piscina'), (18,'CAZ','ADO','piscina'), (18,'JUD','JUD','autopiscina'),
  (18,'JUD','JUD','autopiscina'), (19,'CAZ','POC','piscina'), (19,'CUR','CAZ','piscina'), (19,'JUD','CAZ','piscina'),
  (20,'ADO','CAZ','piscina'), (20,'CUR','ADO','piscina'), (20,'POC','CAZ','piscina'), (20,'JUD','ADO','piscina'),
  (21,'ADO','CUR','piscina'), (21,'CAZ','ADO','piscina'), (21,'JUD','CAZ','piscina'), (21,'CUR','ADO','piscina'),
  (22,'POC','ADO','piscina'), (26,'POC','CUR','piscina'), (26,'ADO','POC','piscina'), (27,'ADO','CUR','piscina'),
  (28,'JUD','CAZ','piscina'), (29,'CAZ','CUR','piscina'), (29,'POC','JUD','piscina'), (30,'POC','CAZ','piscina'),
  (30,'ADO','POC','piscina'), (31,'ADO','JUD','piscina'), (31,'CUR','ADO','piscina'), (32,'CAZ','JUD','piscina'),
  (33,'CUR','ADO','piscina'), (33,'CAZ','CUR','piscina'), (33,'CAZ','POC','piscina'), (34,'ADO','CUR','piscina'),
  (34,'CUR','ADO','piscina'), (34,'JUD','JUD','autopiscina'), (35,'CAZ','ADO','piscina'), (35,'JUD','JUD','autopiscina'),
  (36,'CAZ','CUR','piscina'), (36,'CAZ','CUR','piscina'), (37,'ADO','CUR','piscina'), (37,'ADO','POC','piscina'),
  (37,'ADO','POC','piscina'), (38,'CAZ','ADO','piscina'), (38,'CAZ','CUR','piscina'), (40,'CAZ','CUR','piscina'),
  (41,'POC','ADO','piscina'), (41,'ADO','CAZ','piscina'), (41,'CUR','CAZ','piscina'), (41,'JUD','CAZ','piscina'),
  (41,'POC','CAZ','piscina'), (42,'CUR','JUD','piscina'), (43,'ADO','CUR','piscina'), (44,'CUR','CAZ','piscina'),
  (45,'CUR','CAZ','piscina')
) as v(n, c, tc, k)
join jornadas j on j.number = v.n join _p p on p.code = v.c join _p t on t.code = v.tc;

-- 7) Sanciones, multas y altas: (jornada, jugador, tipo, puntos, motivo)
insert into adjustments (jornada_id, player_id, kind, points, reason)
select j.id, p.id, k, pts, r from (values
  (3,'POC','sancion',-1,'Multa'),
  (3,'CAZ','sancion',-1,'Multa'),
  (13,'JUD','alta',15,'Alta en la liga con 15 puntos'),
  (22,'CUR','sancion',-4,'Primera sanción de la liga'),
  (32,'CAZ','sancion',-1,'Llegar tarde'),
  (32,'ADO','sancion',-1,'Llegar tarde'),
  (36,'CAZ','sancion',-1,'Llegar tarde')
) as v(n, c, k, pts, r)
join jornadas j on j.number = v.n join _p p on p.code = v.c;

-- 8) Puntos de historia: (jornada, jugador, valor)
insert into events (jornada_id, player_id, kind, value)
select j.id, p.id, 'historia', val from (values (1,'CAZ',1), (3,'POC',2), (5,'CUR',1), (9,'POC',1)) as v(n, c, val)
join jornadas j on j.number = v.n join _p p on p.code = v.c;

-- 9) Comprobación: debe dar Super Sapiens 129, Il Cazatore 116,
--    Anitín Poceiro 114, Adolf Victimilla 112, El Judío Supremo 90
select p.nickname,
  coalesce((select sum(points) from results r where r.player_id = p.id), 0)
+ coalesce((select sum(points) from adjustments a where a.player_id = p.id), 0) as puntos
from players p where not p.is_wildcard order by puntos desc;
commit;
