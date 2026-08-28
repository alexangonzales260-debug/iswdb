-- M6: email en usuario (F012)
-- RES-08 necesita mostrar el email del autor de cada reseña en la ficha
-- pública. El email vive en auth.users, esquema no expuesto por PostgREST
-- (config.toml: solo public/graphql_public), así que se desnormaliza en
-- public.usuario para leerlo server-side (service-role) en el embed de la
-- lista de reseñas (decisión A del plan de F012).
--
-- Nullable a propósito: las filas existentes y los inserts de test sin email
-- siguen siendo válidos; el registro (registrarUsuario) y el self-healing
-- (getPerfilData) lo rellenan para los usuarios nuevos.

alter table public.usuario add column email text;

-- Backfill de las filas existentes desde auth.users (la migración corre como
-- postgres, con acceso al esquema auth).
update public.usuario u
set email = au.email
from auth.users au
where u.id = au.id
  and u.email is null;
