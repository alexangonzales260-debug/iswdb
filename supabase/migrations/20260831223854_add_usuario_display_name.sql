-- M10: display_name en usuario (F015)
-- Edición de perfil (F015): el usuario puede cambiar su nombre visible
-- (display_name). Columna nullable a propósito: las filas existentes y los
-- inserts de test sin display_name siguen siendo válidos; el CHECK de longitud
-- (3-50 chars) solo aplica cuando hay valor, no para NULL.
-- El RLS usuario_update_own (M3) ya permite actualizar la fila propia
-- (using/with check: id = auth.uid()); el trigger prevent_self_role_escalation
-- solo protege el campo rol, así que no hay que ajustar ninguna política.

alter table public.usuario add column display_name text;

alter table public.usuario add constraint usuario_display_name_len
  check (display_name is null or char_length(display_name) between 3 and 50);
