-- M19: tabla comentario (F025) + RLS
-- Comentarios de usuarios sobre reseñas (COM-01..06). FK cascade en ambas
-- direcciones (borrar la reseña o el usuario borra sus comentarios). Sin
-- updated_at: editar solo cambia contenido (COM-02). RLS: select público
-- (cualquiera lee, COM-04) y write own (COM-01/02/03/05); sin permisos
-- especiales para el autor de la reseña. Identificadores con ñ entre
-- comillas dobles (decisión 10 de F012).

create table public.comentario (
  id uuid primary key default gen_random_uuid(),
  "reseña_id" uuid not null references public."reseña" (id) on delete cascade,
  user_id uuid not null references public.usuario (id) on delete cascade,
  contenido text not null check (char_length(contenido) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index comentario_resena_ix on public.comentario ("reseña_id", created_at desc);

alter table public.comentario enable row level security;

create policy comentario_select_public on public.comentario
  for select to anon, authenticated using (true);
create policy comentario_insert_own on public.comentario
  for insert to authenticated with check (user_id = auth.uid());
create policy comentario_update_own on public.comentario
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comentario_delete_own on public.comentario
  for delete to authenticated using (user_id = auth.uid());

grant select on table public.comentario to anon, authenticated, service_role;
grant insert, update, delete on table public.comentario to authenticated, service_role;