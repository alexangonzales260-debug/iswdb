-- M21: tabla reseña_like (F027) + RLS
-- Likes de usuarios en reseñas ("Útil"). FK cascade en ambas
-- direcciones (borrar la reseña o el usuario borra sus likes). Sin
-- updated_at: toggle no necesita refresco. UNIQUE(reseña_id, user_id)
-- previene duplicados (LIKE-05). Auto-like permitido.

create table public."reseña_like" (
  "reseña_id" uuid not null references public."reseña" (id) on delete cascade,
  user_id uuid not null references public.usuario (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique ("reseña_id", user_id)
);

-- Conteo de likes por reseña (ORDER BY numLikes DESC en futuros usos).
create index "reseña_like_resena_idx" on public."reseña_like" ("reseña_id");
-- Likes propios del usuario (yaDisteLike).
create index "reseña_like_user_idx" on public."reseña_like" (user_id);

alter table public."reseña_like" enable row level security;

-- Lectura pública (LIKE-04): qualquer pessoa (anon) ve el conteo.
create policy "reseña_like_select_public" on public."reseña_like"
  for select to anon, authenticated using (true);
-- Escritura own (LIKE-01/LIKE-02): solo la fila propia.
create policy "reseña_like_insert_own" on public."reseña_like"
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "reseña_like_delete_own" on public."reseña_like"
  for delete to authenticated
  using (user_id = auth.uid());

-- Grants patrón M2: select público; insert/delete solo authenticated + service_role.
grant select on table public."reseña_like" to anon, authenticated, service_role;
grant insert, delete on table public."reseña_like" to authenticated, service_role;
