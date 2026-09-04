-- M12: Tabla de notificaciones de nuevos episodios
-- Feature 019: Notificaciones

create table public.notificacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  serie_id uuid not null references public.serie(id) on delete cascade,
  episodio_id uuid not null references public.episodio(id) on delete cascade,
  leida boolean not null default false,
  created_at timestamptz not null default now(),
  unique (usuario_id, episodio_id)
);

-- Índices
create index notificacion_usuario_id_idx on public.notificacion (usuario_id);
create index notificacion_leida_idx on public.notificacion (usuario_id, leida);

-- Grants: select/update a authenticated; insert solo service_role
grant select, update on table public.notificacion to authenticated;
grant insert on table public.notificacion to service_role;

-- RLS
alter table public.notificacion enable row level security;

create policy notificacion_select_own on public.notificacion
  for select to authenticated
  using (usuario_id = auth.uid());

create policy notificacion_update_own on public.notificacion
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
