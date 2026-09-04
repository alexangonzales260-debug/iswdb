-- M11: tabla usuario_serie (F018) + RLS
-- Seguimiento de series (follow/unfollow). Permite a usuarios autenticados
-- seguir series (equivalente a la watchlist de IMDb). El follow es un
-- concepto separado de valoraciones/reseñas/listas.

create table public.usuario_serie (
  usuario_id uuid not null references public.usuario (id) on delete cascade,
  serie_id uuid not null references public.serie (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (usuario_id, serie_id)
);

-- Grid de /perfil/seguidas: filtrado por usuario_id.
create index usuario_serie_usuario_idx on public.usuario_serie (usuario_id);
-- "¿quién sigue esta serie" (follow-up) y backstop de la FK serie_id.
create index usuario_serie_serie_idx on public.usuario_serie (serie_id);

alter table public.usuario_serie enable row level security;

-- usuario_serie: lectura/escritura propia (FOL-01/FOL-02/FOL-03/FOL-04).
create policy usuario_serie_select_own on public.usuario_serie
  for select to anon, authenticated
  using (usuario_id = auth.uid());
create policy usuario_serie_insert_own on public.usuario_serie
  for insert to authenticated
  with check (usuario_id = auth.uid());
create policy usuario_serie_delete_own on public.usuario_serie
  for delete to authenticated
  using (usuario_id = auth.uid());

-- Grants patrón M2: el RLS restringe; service_role queda fuera del RLS para
-- las lecturas server-side.
grant select on table public.usuario_serie to anon, authenticated, service_role;
grant insert, delete on table public.usuario_serie to authenticated, service_role;
