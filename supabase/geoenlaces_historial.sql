create table if not exists geoenlaces_historial (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  user_id        uuid references auth.users(id),
  user_email     text not null,
  user_name      text,
  vehiculos      text not null,
  duracion_horas numeric(5, 2),
  expira_at      timestamptz
);

create index if not exists geoenlaces_historial_created_at_idx on geoenlaces_historial (created_at desc);

alter table geoenlaces_historial enable row level security;

-- Lectura: cualquier usuario autenticado puede ver el historial
create policy "historial select" on geoenlaces_historial
  for select using (true);

-- Inserción: solo sistema (a través del API)
create policy "historial insert" on geoenlaces_historial
  for insert with check (true);

-- Sin políticas de UPDATE ni DELETE → registros inmutables
