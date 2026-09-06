# 025 — Comentarios en reseñas

## Contexto
Feature L2. Complemento de F010: otros usuarios pueden comentar reseñas.
Tabla comentario (M19) con RLS público (select) y own (write). Ruta
/reseñas/<id> como página individual de reseña con sección de comentarios.
CRUD simple sin respuestas anidadas, sin likes, sin moderación, sin
notificaciones.

## Rutas
- `/reseñas/<id>`: página de reseña individual con sección de comentarios
  (accesible sin sesión para leer; requiere sesión para comentar).

## Requisitos (EARS)
- COM-01: Cuando un usuario autenticado añade un comentario a una reseña, el
  sistema deberá crear una fila en comentario con user_id = auth.uid().
- COM-02: Cuando un usuario edita su comentario, el sistema deberá actualizar
  el contenido (sin updated_at).
- COM-03: Cuando un usuario borra su comentario, el sistema deberá eliminar la
  fila.
- COM-04: Cualquier usuario (incluso anon) podrá ver los comentarios de una
  reseña pública.
- COM-05: Un usuario no podrá editar/borrar comentarios de otros usuarios.
- COM-06: El contenido del comentario tendrá entre 1 y 1000 caracteres.
- COM-07: La ficha de serie tendrá un link a /reseñas/<id> por cada reseña.
- COM-08: El perfil público tendrá un link a /reseñas/<id> en las reseñas
  propias.

## Criterios de aceptación
- [ ] Añadir comentario a reseña pública (solo con sesión).
- [ ] Editar/borrar propio comentario.
- [ ] No puede editar/borrar comentario ajeno.
- [ ] Anon ve comentarios pero no puede añadir.
- [ ] Contenido validado (1-1000 chars).
- [ ] Link desde ficha de serie a /reseñas/<id>.
- [ ] Link desde perfil público a /reseñas/<id>.
- [ ] Tests de servidor: CRUD, permisos, validación, RLS.
- [ ] Test E2E: añadir/editar/borrar + permisos.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Respuestas anidadas (hilos de comentarios)
- Likes/upvotes en comentarios
- Moderación de comentarios
- Notificaciones de nuevos comentarios
- Edición con historial (updated_at)
- Permisos especiales para autor de reseña
- Comentarios en reseñas privadas (solo públicas)