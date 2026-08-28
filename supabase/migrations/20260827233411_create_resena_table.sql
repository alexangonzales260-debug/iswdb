-- M5: tabla reseña (F012) + RLS
-- Identificadores con ñ entre comillas dobles (decisión 10 del plan de F012).

create table public."reseña" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuario (id) on delete cascade,
  serie_id uuid not null references public.serie (id) on delete cascade,
  contenido text not null check (char_length(contenido) between 50 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, serie_id)
);

create trigger "reseña_set_updated_at"
  before update on public."reseña"
  for each row
  execute function public.set_updated_at();

-- Lista de la ficha (RES-08): reseñas de una serie en orden cronológico
-- descendente. El unique (user_id, serie_id) ya cubre la búsqueda por
-- usuario + serie (RES-07, getReseñaUsuario).
create index "reseña_serie_created_idx" on public."reseña" (serie_id, created_at desc);

alter table public."reseña" enable row level security;

-- Lectura pública (RES-08); escritura solo la fila propia (RES-01/RES-03);
-- borrado del dueño o mod/admin (RES-04/RES-09, is_admin_or_mod de M3, D10).
create policy "reseña_select_public" on public."reseña"
  for select to anon, authenticated using (true);
create policy "reseña_insert_own" on public."reseña"
  for insert to authenticated with check (user_id = auth.uid());
create policy "reseña_update_own" on public."reseña"
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reseña_delete_own_or_mod" on public."reseña"
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin_or_mod());

-- Grants patrón M2: el RLS restringe; service_role queda fuera del RLS para
-- las lecturas server-side con embed de usuario (decisión 2 del plan).
grant select on table public."reseña" to anon, authenticated, service_role;
grant insert, update, delete on table public."reseña" to authenticated, service_role;
