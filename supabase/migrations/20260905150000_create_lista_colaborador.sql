-- M17: tabla lista_colaborador (F024) + RLS
-- Colaboración en listas con roles editor/lector (COL-01..03). El dueño
-- consta como fila explícita (rol editor, invitado_por NULL) al crear la
-- lista. invitado_por → set null si el invitador desaparece (la colab
-- sobrevive). UNIQUE(lista_id, usuario_id) → COL-06 (23505).
-- RLS: se evita recursión mutua lista ↔ lista_colaborador con funciones
-- helper SECURITY DEFINER (patrón is_admin_or_mod, M3/D10).

create table public.lista_colaborador (
  lista_id uuid not null references public.lista (id) on delete cascade,
  usuario_id uuid not null references public.usuario (id) on delete cascade,
  rol text not null default 'editor' check (rol in ('editor', 'lector')),
  invitado_por uuid references public.usuario (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lista_id, usuario_id)
);

create index lista_colaborador_lista_idx on public.lista_colaborador (lista_id);
create index lista_colaborador_usuario_idx on public.lista_colaborador (usuario_id);

-- Helper SECURITY DEFINER: ¿es (p_usuario) colaborador de (p_lista)?
-- Bypass RLS de lista_colaborador y de lista (evita recursión infinita).
create or replace function public.es_colaborador(p_lista uuid, p_usuario uuid, p_rol text default null)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.lista_colaborador
    where lista_id = p_lista
      and usuario_id = p_usuario
      and (p_rol is null or rol = p_rol)
  );
$$;

-- Helper SECURITY DEFINER: ¿es (p_usuario) dueño de (p_lista)?
create or replace function public.es_owner(p_lista uuid, p_usuario uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.lista
    where id = p_lista
      and user_id = p_usuario
  );
$$;

alter table public.lista_colaborador enable row level security;

-- select: cada colaborador ve su propia fila; el dueño ve todas las filas de
-- sus listas (para la UI de gestión). No se referencia lista_colaborador
-- dentro de su propia policy (evita recursión).
create policy lista_colaborador_select_access on public.lista_colaborador
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_owner(lista_id, auth.uid())
  );

-- insert: solo el dueño. invitado_por = auth.uid() salvo en la fila del
-- propio dueño (NULL, se crea junto con la lista).
create policy lista_colaborador_insert_owner on public.lista_colaborador
  for insert to authenticated
  with check (
    public.es_owner(lista_id, auth.uid())
    and (lista_colaborador.invitado_por = auth.uid()
         or lista_colaborador.invitado_por is null)
  );

-- update: solo el dueño; no se permite alterar la fila del dueño.
create policy lista_colaborador_update_owner on public.lista_colaborador
  for update to authenticated
  using (
    public.es_owner(lista_id, auth.uid())
    and not public.es_owner(lista_id, usuario_id)
  )
  with check (
    public.es_owner(lista_id, auth.uid())
    and not public.es_owner(lista_id, usuario_id)
  );

-- delete: solo el dueño; la fila del dueño no se puede borrar.
create policy lista_colaborador_delete_owner on public.lista_colaborador
  for delete to authenticated
  using (
    public.es_owner(lista_id, auth.uid())
    and not public.es_owner(lista_id, usuario_id)
  );

grant select on table public.lista_colaborador to authenticated, service_role;
grant insert, update, delete on table public.lista_colaborador to authenticated, service_role;

-- ── Policies ADICIONALES en lista (sin tocar M9, OR con policies existentes) ──
-- select: dueño (ya M9) OR colaborador invitado (editor o lector)
create policy lista_select_collab on public.lista
  for select to authenticated
  using (public.es_colaborador(id, auth.uid()));

-- update: dueño (ya M9) OR editor colaborador.
-- El trigger guard lista_owner_fields_guard prohíbe user_id/es_publica.
create policy lista_update_editor on public.lista
  for update to authenticated
  using (public.es_colaborador(id, auth.uid(), 'editor'))
  with check (public.es_colaborador(id, auth.uid(), 'editor'));

-- ── Policies ADICIONALES en lista_serie (sin tocar M9, OR con policies existentes) ──
-- select: dueño/propia pública (M9) OR colaborador (editor o lector ve privadas)
create policy lista_serie_select_collab on public.lista_serie
  for select to authenticated
  using (public.es_colaborador(lista_id, auth.uid()));

-- insert: dueño (M9) OR editor colaborador
create policy lista_serie_insert_editor on public.lista_serie
  for insert to authenticated
  with check (public.es_colaborador(lista_id, auth.uid(), 'editor'));

-- update: dueño (M9) OR editor colaborador (incluye reordenar)
create policy lista_serie_update_editor on public.lista_serie
  for update to authenticated
  using (public.es_colaborador(lista_id, auth.uid(), 'editor'))
  with check (public.es_colaborador(lista_id, auth.uid(), 'editor'));

-- delete: dueño (M9) OR editor colaborador
create policy lista_serie_delete_editor on public.lista_serie
  for delete to authenticated
  using (public.es_colaborador(lista_id, auth.uid(), 'editor'));

-- ── Trigger guard: user_id inmutable; es_publica solo dueño ──
create or replace function public.lista_owner_fields_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prohibir transferencia de propiedad (user_id inmutable)
  if new.user_id is distinct from old.user_id then
    raise exception 'lista: user_id es inmutable';
  end if;
  -- Solo el dueño puede cambiar es_publica
  if new.es_publica is distinct from old.es_publica
     and old.user_id <> auth.uid() then
    raise exception 'lista: solo el dueño puede cambiar es_publica';
  end if;
  return new;
end;
$$;

create trigger lista_owner_fields_guard
  before update on public.lista
  for each row
  when (new.user_id is distinct from old.user_id
        or new.es_publica is distinct from old.es_publica)
  execute function public.lista_owner_fields_guard();

grant execute on function public.es_colaborador(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.es_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.lista_owner_fields_guard() to authenticated, service_role;