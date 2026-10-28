-- ============================================================
-- LOD · Prensa: periódicos de El Napicol subidos desde la app
-- Pegar en Supabase → SQL Editor → Run
-- Los 4 primeros periódicos van dentro de la app (public/napicol), no hace falta subirlos.
-- ============================================================

create table if not exists periodicos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  fecha date not null,
  dia_number int,
  html text not null,
  created_at timestamptz not null default now()
);

alter table periodicos enable row level security;

drop policy if exists "periodicos lectura" on periodicos;
create policy "periodicos lectura" on periodicos for select using (true);

-- Cualquiera con la app puede subir (Vilanova no necesita ser admin); borrar, solo admin
drop policy if exists "periodicos subir" on periodicos;
create policy "periodicos subir" on periodicos for insert with check (true);

drop policy if exists "periodicos borrar" on periodicos;
create policy "periodicos borrar" on periodicos for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table periodicos;
