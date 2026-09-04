-- M13: Fix service_role grants on notificacion table
-- Service_role is the trusted server-side role for bulk notification operations.
-- It needs full privileges (select/insert/update/delete) on notificacion
-- to execute upserts with onConflict, and for test verifications.

grant select, insert, update, delete on table public.notificacion to service_role;