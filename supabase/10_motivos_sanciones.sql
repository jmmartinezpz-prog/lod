-- ============================================================
-- LOD · Motivos de las sanciones del histórico
-- Pegar en Supabase → SQL Editor → Run
-- ============================================================

update adjustments a set reason = v.motivo
from (values
  (3,  'Il Cazatore',      'Llegar tarde'),
  (3,  'Anitín Poceiro',   'Llegar tarde'),
  (22, 'Super Sapiens',    'No acudir el día de su cumpleaños'),
  (32, 'Il Cazatore',      'Llegar tarde'),
  (32, 'Adolf Victimilla', 'Llegar tarde'),
  (36, 'Il Cazatore',      'Llegar tarde')
) as v(jornada, jugador, motivo)
join jornadas j on j.number = v.jornada
join players p on p.nickname = v.jugador
where a.kind = 'sancion' and a.jornada_id = j.id and a.player_id = p.id;

-- Comprobación
select p.nickname, j.number as jornada, a.points, a.reason
from adjustments a join players p on p.id = a.player_id left join jornadas j on j.id = a.jornada_id
where a.kind = 'sancion' order by j.number;
