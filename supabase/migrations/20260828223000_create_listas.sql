-- M9: tablas lista y lista_serie (F013) + RLS
-- Listas personalizadas de series (públicas o privadas). lista_serie
-- relaciona series con una lista en orden manual (posicion). El RLS de
-- lista_serie depende del owner vía subconsulta al padre lista (no tiene
-- user_id propio).

create table public.lista (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuario (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 100),
  descripcion text,
  es_publica boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lista_set_updated_at
  before update on public.lista
  for each row
  execute function public.set_updated_at();

-- Grid de mis listas (/listas): filtrado por user_id.
create index lista_user_idx on public.lista (user_id);

create table public.lista_serie (
  lista_id uuid not null references public.lista (id) on delete cascade,
  serie_id uuid not null references public.serie (id) on delete cascade,
  posicion integer not null,
  added_at timestamptz not null default now(),
  unique (lista_id, serie_id)
);

-- Orden manual del detalle: posicion asc por lista.
create index lista_serie_lista_posicion_idx on public.lista_serie (lista_id, posicion);
-- Búsqueda inversa ("¿en qué listas está esta serie") y backstop de la FK serie_id.
create index lista_serie_serie_idx on public.lista_serie (serie_id);

alter table public.lista enable row level security;
alter table public.lista_serie enable row level security;

-- lista: lectura propia o pública; escritura propia (LIS-07/LIS-08).
create policy lista_select_own_or_public on public.lista
  for select to anon, authenticated
  using (es_publica = true or user_id = auth.uid());
create policy lista_insert_own on public.lista
  for insert to authenticated with check (user_id = auth.uid());
create policy lista_update_own on public.lista
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lista_delete_own on public.lista
  for delete to authenticated using (user_id = auth.uid());

-- lista_serie: lectura vinculada a la visibilidad de la lista padre; escritura
-- (insert/update/delete) solo del owner de la lista. La subconsulta sobre
-- public.lista respeta su propio RLS: un rol solo puede "ver" listas propias o
-- públicas, y la condición lista.user_id = auth.uid() restringe la escritura.
create policy lista_serie_select_own_or_public on public.lista_serie
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.lista
      where lista.id = lista_serie.lista_id
        and (lista.es_publica = true or lista.user_id = auth.uid())
    )
  );
create policy lista_serie_insert_own on public.lista_serie
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.lista
      where lista.id = lista_serie.lista_id
        and lista.user_id = auth.uid()
    )
  );
create policy lista_serie_update_own on public.lista_serie
  for update to authenticated
  using (
    exists (
      select 1
      from public.lista
      where lista.id = lista_serie.lista_id
        and lista.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.lista
      where lista.id = lista_serie.lista_id
        and lista.user_id = auth.uid()
    )
  );
create policy lista_serie_delete_own on public.lista_serie
  for delete to authenticated
  using (
    exists (
      select 1
      from public.lista
      where lista.id = lista_serie.lista_id
        and lista.user_id = auth.uid()
    )
  );

-- Grants patrón M2: el RLS restringe; service_role queda fuera del RLS para
-- las lecturas/escrituras server-side.
grant select on table public.lista to anon, authenticated, service_role;
grant insert, update, delete on table public.lista to authenticated, service_role;
grant select on table public.lista_serie to anon, authenticated, service_role;
grant insert, update, delete on table public.lista_serie to authenticated, service_role;
