-- M7: restringir el SELECT de usuario a la fila propia (F012)
-- M6 añadió la columna email a usuario; usuario_select_authenticated (M3)
-- usa `using (true)` y exponía el email de todos los usuarios a cualquier
-- cuenta autenticada vía API raw. Se restringe el SELECT a la fila propia o
-- a mod/admin (D10), en línea con insert/update/delete que ya son own-only.
--
-- Alcance verificado: la app solo lee la fila propia (getRolUsuario en
-- lib/admin.ts con el id de la sesión; getPerfilData en lib/auth.ts); la
-- lista pública de reseñas lee el email del autor con el cliente
-- service-role (fuera del RLS, solo server-side). anon sigue sin grant ni
-- política de SELECT.

drop policy usuario_select_authenticated on public.usuario;

create policy usuario_select_own on public.usuario
  for select to authenticated
  using (id = auth.uid() or public.is_admin_or_mod());
