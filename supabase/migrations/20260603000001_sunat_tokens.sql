create table if not exists sunat_tokens (
  id            uuid primary key default gen_random_uuid(),
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table sunat_tokens enable row level security;
-- no policies → anon/authenticated blocked; service_role bypasses RLS

-- singleton placeholder row
insert into sunat_tokens (id, access_token, expires_at)
values ('00000000-0000-0000-0000-000000000001', '', now())
on conflict (id) do nothing;
