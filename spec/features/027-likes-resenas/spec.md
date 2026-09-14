# 027 — Likes/upvotes en reseñas

## Contexto
Feature L2. Extensión social de F010: otros usuarios pueden marcar reseñas
como útiles ("Útil", patrón "was this helpful?" de IMDb). Tabla reseña_like
(M21) con UNIQUE por usuario/reseña. Botón toggle con contador en ficha y en
/resenas/<id>. Sin notificaciones, sin orden por likes, sin downvote.
Auto-like permitido.

## Rutas
- `/series/<slug>`: botón "Útil" + contador en cada reseña de
  reseñas-section.
- `/resenas/<id>`: botón "Útil" + contador en la reseña individual.

## Requisitos (EARS)
- LIKE-01: Cuando un usuario autenticado hace click en "Útil" en una reseña,
  el sistema deberá crear una fila en reseña_like.
- LIKE-02: Cuando hace click de nuevo (unlike), el sistema deberá borrar la
  fila.
- LIKE-03: El botón deberá mostrar el estado inicial (like dado o no) y el
  conteo total de likes.
- LIKE-04: Cualquier usuario (incluso anon) podrá ver el conteo de likes.
- LIKE-05: Un usuario no podrá dar like dos veces a la misma reseña (UNIQUE).
- LIKE-06: Sin sesión, el contador será visible y el botón estará
  deshabilitado.
- LIKE-07: El autor de una reseña podrá dar like a su propia reseña.

## Criterios de aceptación
- [ ] Dar/quitar like con toggle y contador actualizado.
- [ ] Estado inicial correcto (yaDisteLike).
- [ ] Contador visible para anon; botón deshabilitado sin sesión.
- [ ] UNIQUE previene doble like (idempotente en doble click).
- [ ] Auto-like permitido.
- [ ] numLikes y yaDisteLike en listReseñasSerie y getReseña.
- [ ] Tests de servidor: dar/quitar/idempotencia/RLS/cascade/integración.
- [ ] Test E2E: toggle + auto-like + sin sesión.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de likes en tus reseñas
- Ordenar reseñas por likes
- Downvote / "no útil"
- Conteo de likes recibidos en el perfil público
- Likes en comentarios (solo reseñas)
