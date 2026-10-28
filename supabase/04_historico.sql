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
  (1,'Anitín Poceiro',1,4), (1,'Super Sapiens',2,2), (1,'El Gaitero de Ortigueira',3,1), (1,'Adolf Victimilla',4,0), (1,'Il Cazatore',5,0),
  (2,'Anitín Poceiro',1,4), (2,'Super Sapiens',2,2), (2,'Il Cazatore',3,1), (2,'El Gaitero de Ortigueira',4,0), (2,'Adolf Victimilla',5,0),
  (3,'Il Cazatore',1,4), (3,'Super Sapiens',2,2), (3,'Adolf Victimilla',3,1), (3,'Anitín Poceiro',4,0),
  (4,'Anitín Poceiro',1,4), (4,'Super Sapiens',2,2), (4,'Adolf Victimilla',3,1), (4,'Il Cazatore',4,0),
  (5,'Super Sapiens',1,7), (5,'Il Cazatore',2,4), (5,'Adolf Victimilla',3,2), (5,'Anitín Poceiro',4,0),
  (6,'Anitín Poceiro',1,4), (6,'Il Cazatore',2,2), (6,'Super Sapiens',3,1), (6,'Adolf Victimilla',4,0),
  (7,'Super Sapiens',1,4), (7,'Il Cazatore',2,2), (7,'Adolf Victimilla',3,1), (7,'Anitín Poceiro',4,0),
  (8,'Anitín Poceiro',1,4), (8,'Adolf Victimilla',2,2), (8,'Il Cazatore',3,1), (8,'Super Sapiens',4,0),
  (9,'Il Cazatore',1,7), (9,'Anitín Poceiro',2,4), (9,'Adolf Victimilla',3,2), (9,'Super Sapiens',4,0),
  (10,'Adolf Victimilla',1,4), (10,'Anitín Poceiro',2,2), (10,'Il Cazatore',3,1), (10,'Super Sapiens',4,0),
  (11,'Adolf Victimilla',1,4), (11,'Il Cazatore',2,2), (11,'Anitín Poceiro',3,1), (11,'Super Sapiens',4,0),
  (12,'Adolf Victimilla',1,7), (12,'Super Sapiens',2,4), (12,'Anitín Poceiro',3,2), (12,'Il Cazatore',4,0),
  (13,'Il Cazatore',1,5), (13,'Adolf Victimilla',2,3), (13,'Super Sapiens',3,2), (13,'El Judío Supremo',4,1), (13,'Anitín Poceiro',5,0),
  (14,'El Judío Supremo',1,5), (14,'Anitín Poceiro',2,3), (14,'Super Sapiens',3,2), (14,'Adolf Victimilla',4,1), (14,'Il Cazatore',5,0),
  (15,'Il Cazatore',1,5), (15,'Super Sapiens',2,3), (15,'Anitín Poceiro',3,2), (15,'El Judío Supremo',4,1), (15,'Adolf Victimilla',5,0),
  (16,'Adolf Victimilla',1,9), (16,'El Judío Supremo',2,6), (16,'Anitín Poceiro',3,4), (16,'Il Cazatore',4,2), (16,'Super Sapiens',5,0),
  (17,'Adolf Victimilla',1,5), (17,'El Judío Supremo',2,3), (17,'Anitín Poceiro',3,2), (17,'Super Sapiens',4,1), (17,'Il Cazatore',5,0),
  (18,'Il Cazatore',1,9), (18,'Anitín Poceiro',2,6), (18,'Super Sapiens',3,4), (18,'Adolf Victimilla',4,2), (18,'El Judío Supremo',5,0),
  (19,'Super Sapiens',1,5), (19,'Anitín Poceiro',2,3), (19,'Il Cazatore',3,2), (19,'Adolf Victimilla',4,1), (19,'El Judío Supremo',5,0),
  (20,'Super Sapiens',1,5), (20,'El Judío Supremo',2,3), (20,'Il Cazatore',3,2), (20,'Anitín Poceiro',4,1), (20,'Adolf Victimilla',5,0),
  (21,'Guerritas Maduro',1,9), (21,'Super Sapiens',2,6), (21,'Il Cazatore',3,4), (21,'Anitín Poceiro',4,2), (21,'El Judío Supremo',5,0), (21,'Adolf Victimilla',6,0),
  (22,'El Judío Supremo',1,5), (22,'Guerritas Maduro',2,0), (22,'Il Cazatore',3,3), (22,'Anitín Poceiro',4,2), (22,'Adolf Victimilla',5,1), (22,'Super Sapiens',6,0),
  (23,'El Judío Supremo',1,5), (23,'Il Cazatore',2,3), (23,'Anitín Poceiro',3,2), (23,'Adolf Victimilla',4,1), (23,'Super Sapiens',5,0),
  (24,'Super Sapiens',1,5), (24,'Il Cazatore',2,3), (24,'El Judío Supremo',3,2), (24,'Adolf Victimilla',4,1), (24,'Anitín Poceiro',5,0),
  (25,'Super Sapiens',1,9), (25,'Adolf Victimilla',2,6), (25,'El Judío Supremo',3,4), (25,'Anitín Poceiro',4,2), (25,'Il Cazatore',5,0),
  (26,'El Judío Supremo',1,5), (26,'Il Cazatore',2,3), (26,'Adolf Victimilla',3,2), (26,'Super Sapiens',4,1), (26,'Anitín Poceiro',5,0),
  (27,'Adolf Victimilla',1,5), (27,'El Judío Supremo',2,3), (27,'Anitín Poceiro',3,2), (27,'Super Sapiens',4,1), (27,'Il Cazatore',5,0),
  (28,'Super Sapiens',1,9), (28,'Anitín Poceiro',2,6), (28,'Adolf Victimilla',3,4), (28,'Il Cazatore',4,2), (28,'El Judío Supremo',5,0),
  (29,'Super Sapiens',1,5), (29,'Anitín Poceiro',2,3), (29,'Adolf Victimilla',3,2), (29,'El Judío Supremo',4,1), (29,'Il Cazatore',5,0),
  (30,'Il Cazatore',1,5), (30,'Adolf Victimilla',2,3), (30,'Anitín Poceiro',3,2), (30,'El Judío Supremo',4,1), (30,'Super Sapiens',5,0),
  (31,'Anitín Poceiro',1,9), (31,'El Judío Supremo',2,6), (31,'Il Cazatore',3,4), (31,'Super Sapiens',4,2), (31,'Adolf Victimilla',5,0),
  (32,'Il Cazatore',1,5), (32,'Adolf Victimilla',2,3), (32,'El Judío Supremo',3,2), (32,'Anitín Poceiro',4,1), (32,'Super Sapiens',5,0),
  (33,'Super Sapiens',1,5), (33,'Il Cazatore',2,3), (33,'Adolf Victimilla',3,2), (33,'Anitín Poceiro',4,1), (33,'El Judío Supremo',5,0),
  (34,'Super Sapiens',1,9), (34,'Il Cazatore',2,6), (34,'Anitín Poceiro',3,4), (34,'El Judío Supremo',4,2), (34,'Adolf Victimilla',5,0),
  (35,'Il Cazatore',1,5), (35,'Adolf Victimilla',2,3), (35,'Super Sapiens',3,2), (35,'Anitín Poceiro',4,1), (35,'El Judío Supremo',5,0),
  (36,'Adolf Victimilla',1,5), (36,'Anitín Poceiro',2,3), (36,'Il Cazatore',3,2), (36,'El Judío Supremo',4,1), (36,'Super Sapiens',5,0),
  (37,'Adolf Victimilla',1,5), (37,'El Judío Supremo',2,3), (37,'Anitín Poceiro',3,2), (37,'Il Cazatore',4,1), (37,'Super Sapiens',5,0),
  (38,'Il Cazatore',1,9), (38,'El Judío Supremo',2,6), (38,'Super Sapiens',3,4), (38,'Anitín Poceiro',4,2), (38,'Adolf Victimilla',5,0),
  (39,'Adolf Victimilla',1,5), (39,'Il Cazatore',2,3), (39,'Anitín Poceiro',3,2), (39,'Super Sapiens',4,1), (39,'El Judío Supremo',5,0),
  (40,'Il Cazatore',1,5), (40,'Adolf Victimilla',2,3), (40,'Super Sapiens',3,2), (40,'Anitín Poceiro',4,1), (40,'El Judío Supremo',5,0),
  (41,'Anitín Poceiro',1,9), (41,'Super Sapiens',2,6), (41,'Adolf Victimilla',3,4), (41,'El Judío Supremo',4,2), (41,'Il Cazatore',5,0),
  (42,'El Judío Supremo',1,5), (42,'Super Sapiens',2,3), (42,'Adolf Victimilla',3,2), (42,'Il Cazatore',4,1), (42,'Anitín Poceiro',5,0),
  (43,'Adolf Victimilla',1,5), (43,'Super Sapiens',2,3), (43,'Il Cazatore',3,2), (43,'El Judío Supremo',4,1), (43,'Anitín Poceiro',5,0),
  (44,'Super Sapiens',1,9), (44,'Anitín Poceiro',2,6), (44,'Adolf Victimilla',3,4), (44,'El Judío Supremo',4,2), (44,'Il Cazatore',5,0),
  (45,'Super Sapiens',1,5), (45,'Anitín Poceiro',2,3), (45,'Adolf Victimilla',3,2), (45,'Il Cazatore',4,1), (45,'El Judío Supremo',5,0)
) as v(n, c, pos, pts)
join jornadas j on j.number = v.n join players p on p.nickname = v.c;

-- 6) Piscinas y autopiscinas: (jornada, de, a, tipo)
insert into events (jornada_id, player_id, target_player_id, kind, value)
select j.id, p.id, t.id, k, 1 from (values
  (1,'Anitín Poceiro','Il Cazatore','piscina'), (1,'El Gaitero de Ortigueira','Anitín Poceiro','piscina'), (2,'Adolf Victimilla','Anitín Poceiro','piscina'), (4,'Super Sapiens','Adolf Victimilla','piscina'),
  (4,'Anitín Poceiro','Il Cazatore','piscina'), (4,'Super Sapiens','Adolf Victimilla','piscina'), (5,'Il Cazatore','Anitín Poceiro','piscina'), (6,'Anitín Poceiro','Super Sapiens','piscina'),
  (6,'Adolf Victimilla','Il Cazatore','piscina'), (7,'Super Sapiens','Il Cazatore','piscina'), (9,'Super Sapiens','Anitín Poceiro','piscina'), (9,'Anitín Poceiro','Super Sapiens','piscina'),
  (9,'Adolf Victimilla','Il Cazatore','piscina'), (9,'Il Cazatore','Anitín Poceiro','piscina'), (9,'Anitín Poceiro','Il Cazatore','piscina'), (10,'Adolf Victimilla','Anitín Poceiro','piscina'),
  (11,'Anitín Poceiro','Super Sapiens','piscina'), (11,'Il Cazatore','Anitín Poceiro','piscina'), (12,'Anitín Poceiro','Il Cazatore','piscina'), (12,'Adolf Victimilla','Il Cazatore','piscina'),
  (12,'Adolf Victimilla','Il Cazatore','piscina'), (12,'Adolf Victimilla','Il Cazatore','piscina'), (12,'Adolf Victimilla','Super Sapiens','piscina'), (12,'Adolf Victimilla','Adolf Victimilla','autopiscina'),
  (13,'El Judío Supremo','Il Cazatore','piscina'), (13,'El Judío Supremo','Il Cazatore','piscina'), (13,'Il Cazatore','El Judío Supremo','piscina'), (13,'Adolf Victimilla','Anitín Poceiro','piscina'),
  (14,'Adolf Victimilla','Il Cazatore','piscina'), (14,'El Judío Supremo','Anitín Poceiro','piscina'), (15,'Super Sapiens','El Judío Supremo','piscina'), (15,'Super Sapiens','Anitín Poceiro','piscina'),
  (16,'Adolf Victimilla','Super Sapiens','piscina'), (16,'Adolf Victimilla','Il Cazatore','piscina'), (17,'Il Cazatore','Anitín Poceiro','piscina'), (17,'Anitín Poceiro','Il Cazatore','piscina'),
  (17,'Anitín Poceiro','Il Cazatore','piscina'), (18,'Anitín Poceiro','Il Cazatore','piscina'), (18,'Il Cazatore','Adolf Victimilla','piscina'), (18,'El Judío Supremo','El Judío Supremo','autopiscina'),
  (18,'El Judío Supremo','El Judío Supremo','autopiscina'), (19,'Il Cazatore','Anitín Poceiro','piscina'), (19,'Super Sapiens','Il Cazatore','piscina'), (19,'El Judío Supremo','Il Cazatore','piscina'),
  (20,'Adolf Victimilla','Il Cazatore','piscina'), (20,'Super Sapiens','Adolf Victimilla','piscina'), (20,'Anitín Poceiro','Il Cazatore','piscina'), (20,'El Judío Supremo','Adolf Victimilla','piscina'),
  (21,'Adolf Victimilla','Super Sapiens','piscina'), (21,'Il Cazatore','Adolf Victimilla','piscina'), (21,'El Judío Supremo','Il Cazatore','piscina'), (21,'Super Sapiens','Adolf Victimilla','piscina'),
  (22,'Anitín Poceiro','Adolf Victimilla','piscina'), (26,'Anitín Poceiro','Super Sapiens','piscina'), (26,'Adolf Victimilla','Anitín Poceiro','piscina'), (27,'Adolf Victimilla','Super Sapiens','piscina'),
  (28,'El Judío Supremo','Il Cazatore','piscina'), (29,'Il Cazatore','Super Sapiens','piscina'), (29,'Anitín Poceiro','El Judío Supremo','piscina'), (30,'Anitín Poceiro','Il Cazatore','piscina'),
  (30,'Adolf Victimilla','Anitín Poceiro','piscina'), (31,'Adolf Victimilla','El Judío Supremo','piscina'), (31,'Super Sapiens','Adolf Victimilla','piscina'), (32,'Il Cazatore','El Judío Supremo','piscina'),
  (33,'Super Sapiens','Adolf Victimilla','piscina'), (33,'Il Cazatore','Super Sapiens','piscina'), (33,'Il Cazatore','Anitín Poceiro','piscina'), (34,'Adolf Victimilla','Super Sapiens','piscina'),
  (34,'Super Sapiens','Adolf Victimilla','piscina'), (34,'El Judío Supremo','El Judío Supremo','autopiscina'), (35,'Il Cazatore','Adolf Victimilla','piscina'), (35,'El Judío Supremo','El Judío Supremo','autopiscina'),
  (36,'Il Cazatore','Super Sapiens','piscina'), (36,'Il Cazatore','Super Sapiens','piscina'), (37,'Adolf Victimilla','Super Sapiens','piscina'), (37,'Adolf Victimilla','Anitín Poceiro','piscina'),
  (37,'Adolf Victimilla','Anitín Poceiro','piscina'), (38,'Il Cazatore','Adolf Victimilla','piscina'), (38,'Il Cazatore','Super Sapiens','piscina'), (40,'Il Cazatore','Super Sapiens','piscina'),
  (41,'Anitín Poceiro','Adolf Victimilla','piscina'), (41,'Adolf Victimilla','Il Cazatore','piscina'), (41,'Super Sapiens','Il Cazatore','piscina'), (41,'El Judío Supremo','Il Cazatore','piscina'),
  (41,'Anitín Poceiro','Il Cazatore','piscina'), (42,'Super Sapiens','El Judío Supremo','piscina'), (43,'Adolf Victimilla','Super Sapiens','piscina'), (44,'Super Sapiens','Il Cazatore','piscina'),
  (45,'Super Sapiens','Il Cazatore','piscina')
) as v(n, c, tc, k)
join jornadas j on j.number = v.n join players p on p.nickname = v.c join players t on t.nickname = v.tc;

-- 7) Sanciones, multas y altas: (jornada, jugador, tipo, puntos, motivo)
insert into adjustments (jornada_id, player_id, kind, points, reason)
select j.id, p.id, k, pts, r from (values
  (3,'Anitín Poceiro','sancion',-1,'Llegar tarde'),
  (3,'Il Cazatore','sancion',-1,'Llegar tarde'),
  (13,'El Judío Supremo','alta',15,'Alta en la liga con 15 puntos'),
  (22,'Super Sapiens','sancion',-4,'No acudir el día de su cumpleaños'),
  (32,'Il Cazatore','sancion',-1,'Llegar tarde'),
  (32,'Adolf Victimilla','sancion',-1,'Llegar tarde'),
  (36,'Il Cazatore','sancion',-1,'Llegar tarde')
) as v(n, c, k, pts, r)
join jornadas j on j.number = v.n join players p on p.nickname = v.c;

-- 8) Puntos de historia: (jornada, jugador, valor)
insert into events (jornada_id, player_id, kind, value)
select j.id, p.id, 'historia', val from (values (1,'Il Cazatore',1), (3,'Anitín Poceiro',2), (5,'Super Sapiens',1), (9,'Anitín Poceiro',1)) as v(n, c, val)
join jornadas j on j.number = v.n join players p on p.nickname = v.c;

commit;

-- 9) Comprobación: debe dar Super Sapiens 129, Il Cazatore 116,
--    Anitín Poceiro 114, Adolf Victimilla 112, El Judío Supremo 90
select p.nickname,
  coalesce((select sum(points) from results r where r.player_id = p.id), 0)
+ coalesce((select sum(points) from adjustments a where a.player_id = p.id), 0) as puntos
from players p where not p.is_wildcard order by puntos desc;
