create table if not exists service_locations (
  id          uuid primary key default gen_random_uuid(),
  task_id     integer      not null,
  step_index  integer      not null,
  step_label  text         not null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    double precision,
  created_at  timestamptz  not null default now()
);

create index if not exists service_locations_task_id_idx on service_locations (task_id);

-- RLS: conductor solo puede insertar sus propios registros (anon key)
alter table service_locations enable row level security;

create policy "conductor insert" on service_locations
  for insert with check (true);

create policy "staff read" on service_locations
  for select using (true);
