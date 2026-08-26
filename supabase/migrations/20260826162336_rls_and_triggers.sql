-- M3: RLS + triggers de seguridad

-- is_admin_or_mod(): true si auth.uid() tiene fila en usuario con rol mod/admin;
-- false si no hay fila. SECURITY DEFINER para poder leer public.usuario como
-- postgres (dueño de la tabla) aunque el RLS de usuario oculte filas al rol
-- invocador.
create or replace function public.is_admin_or_mod()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuario
    where id = auth.uid()
      and rol in ('mod', 'admin')
  );
$$;

-- prevent_self_role_escalation(): un usuario no puede cambiarse su propio rol
-- salvo que ya sea admin/mod (p.ej. un admin que se degrada a mod).
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin_or_mod() then
    raise exception 'un usuario no puede cambiar su propio rol';
  end if;
  return new;
end;
$$;

create trigger usuario_prevent_self_role_escalation
  before update on public.usuario
  for each row
  when (new.rol is distinct from old.rol)
  execute function public.prevent_self_role_escalation();

-- RLS activo en las 7 tablas del dominio.
alter table public.categoria enable row level security;
alter table public.canal enable row level security;
alter table public.serie enable row level security;
alter table public.episodio enable row level security;
alter table public.participa enable row level security;
alter table public.usuario enable row level security;
alter table public.valoracion enable row level security;

-- Catálogo: lectura pública; escritura solo admin/mod (MOD-05).
create policy categoria_select_public on public.categoria
  for select to anon, authenticated using (true);
create policy categoria_insert_admin_mod on public.categoria
  for insert to authenticated with check (public.is_admin_or_mod());
create policy categoria_update_admin_mod on public.categoria
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy categoria_delete_admin_mod on public.categoria
  for delete to authenticated using (public.is_admin_or_mod());

create policy canal_select_public on public.canal
  for select to anon, authenticated using (true);
create policy canal_insert_admin_mod on public.canal
  for insert to authenticated with check (public.is_admin_or_mod());
create policy canal_update_admin_mod on public.canal
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy canal_delete_admin_mod on public.canal
  for delete to authenticated using (public.is_admin_or_mod());

create policy serie_select_public on public.serie
  for select to anon, authenticated using (true);
create policy serie_insert_admin_mod on public.serie
  for insert to authenticated with check (public.is_admin_or_mod());
create policy serie_update_admin_mod on public.serie
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy serie_delete_admin_mod on public.serie
  for delete to authenticated using (public.is_admin_or_mod());

create policy episodio_select_public on public.episodio
  for select to anon, authenticated using (true);
create policy episodio_insert_admin_mod on public.episodio
  for insert to authenticated with check (public.is_admin_or_mod());
create policy episodio_update_admin_mod on public.episodio
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy episodio_delete_admin_mod on public.episodio
  for delete to authenticated using (public.is_admin_or_mod());

create policy participa_select_public on public.participa
  for select to anon, authenticated using (true);
create policy participa_insert_admin_mod on public.participa
  for insert to authenticated with check (public.is_admin_or_mod());
create policy participa_update_admin_mod on public.participa
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy participa_delete_admin_mod on public.participa
  for delete to authenticated using (public.is_admin_or_mod());

-- valoracion: lectura pública (D11); escritura solo la fila propia.
create policy valoracion_select_public on public.valoracion
  for select to anon, authenticated using (true);
create policy valoracion_insert_own on public.valoracion
  for insert to authenticated with check (user_id = auth.uid());
create policy valoracion_update_own on public.valoracion
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy valoracion_delete_own on public.valoracion
  for delete to authenticated using (user_id = auth.uid());

-- usuario: lectura solo autenticados; cada usuario gestiona su propia fila.
-- El trigger usuario_prevent_self_role_escalation protege el campo rol.
create policy usuario_select_authenticated on public.usuario
  for select to authenticated using (true);
create policy usuario_insert_own on public.usuario
  for insert to authenticated with check (id = auth.uid());
create policy usuario_update_own on public.usuario
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy usuario_delete_own on public.usuario
  for delete to authenticated using (id = auth.uid());
