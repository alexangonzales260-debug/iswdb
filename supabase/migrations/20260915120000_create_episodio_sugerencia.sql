create table public.episodio_sugerencia (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null references public.serie (id) on delete cascade,
  video_id_youtube text not null,
  titulo_detectado text not null check (char_length(titulo_detectado) between 1 and 255),
  descripcion text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  fecha_deteccion timestamptz not null default now(),
  detectado_por text not null default 'servicio',
  temporada_detectada int not null default 1 check (temporada_detectada >= 1),
  numero_detectado int check (numero_detectado is null or numero_detectado >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serie_id, video_id_youtube)
);

create trigger episodio_sugerencia_set_updated_at
  before update on public.episodio_sugerencia
  for each row
  execute function public.set_updated_at();

create index episodio_sugerencia_serie_idx
  on public.episodio_sugerencia (serie_id, estado);
create index episodio_sugerencia_estado_fecha_idx
  on public.episodio_sugerencia (estado, fecha_deteccion desc);

grant select, insert, update, delete on table public.episodio_sugerencia
  to authenticated, service_role;

alter table public.episodio_sugerencia enable row level security;

create policy "episodio_sugerencia_select_mod" on public.episodio_sugerencia
  for select to authenticated using (public.is_admin_or_mod());

create policy "episodio_sugerencia_insert_mod" on public.episodio_sugerencia
  for insert to authenticated with check (public.is_admin_or_mod());

create policy "episodio_sugerencia_update_mod" on public.episodio_sugerencia
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());

create policy "episodio_sugerencia_delete_mod" on public.episodio_sugerencia
  for delete to authenticated using (public.is_admin_or_mod());
