-- M15: tabla usuario_usuario (F022) + RLS
-- Seguir usuarios. SEG-08 (CHECK anti-autofollow), SEG-09 (UNIQUE),
-- SEG-10 (RLS own). Grants patrón M2/M11: service_role queda fuera del RLS
-- para contadores/feed cross-user server-side (D25).

create table public.usuario_usuario (
  seguidor_id uuid not null references public.usuario (id) on delete cascade,
  seguido_id uuid not null references public.usuario (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (seguidor_id, seguido_id),
  check (seguidor_id <> seguido_id)
);

-- "Seguidos" de un usuario (contador + feed): filtrado por seguidor_id.
create index usuario_usuario_seguidor_idx on public.usuario_usuario (seguidor_id);
-- "Seguidores" de un usuario (contador): filtrado por seguido_id.
create index usuario_usuario_seguido_idx on public.usuario_usuario (seguido_id);

alter table public.usuario_usuario enable row level security;

-- RLS own: un usuario solo gestiona follows donde ÉL es el seguidor (SEG-10).
create policy usuario_usuario_select_own on public.usuario_usuario
  for select to anon, authenticated
  using (seguidor_id = auth.uid());
create policy usuario_usuario_insert_own on public.usuario_usuario
  for insert to authenticated
  with check (seguidor_id = auth.uid());
create policy usuario_usuario_delete_own on public.usuario_usuario
  for delete to authenticated
  using (seguidor_id = auth.uid());

grant select on table public.usuario_usuario to anon, authenticated, service_role;
grant insert, delete on table public.usuario_usuario to authenticated, service_role;