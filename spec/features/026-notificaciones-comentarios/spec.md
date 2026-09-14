# 026 — Notificaciones de comentarios en reseñas

## Contexto
Feature L2. Complemento de F025: cuando alguien comenta tu reseña, recibes
notificación. Reutiliza tabla notificacion (M16) con migración M20 para
comentario_id y tipo 'nuevo_comentario'. Cada comentario genera notificación
(sin UNIQUE). Sin auto-notificación al comentar la propia reseña. Fallo de
notificación no rompe el comentario.

## Rutas
- `/perfil/notificaciones`: muestra "Nuevo episodio en <serie>",
  "<username> empezó a seguirte" y "<username> comentó tu reseña en <serie>"
  con link al comentario.

## Requisitos (EARS)
- NOTC-01: Cuando un usuario B comenta una reseña de A (B ≠ A), el sistema
  deberá generar una notificación para A con tipo 'nuevo_comentario'.
- NOTC-02: La notificación deberá mostrar "<username> comentó tu reseña en
  <serie>" con link a /resenas/<id>#comentario-<id>.
- NOTC-03: Cuando un usuario comenta su propia reseña, el sistema NO deberá
  generar notificación.
- NOTC-04: Cada comentario generará una notificación (sin UNIQUE para
  nuevo_comentario).
- NOTC-05: Editar o borrar un comentario NO generará ni borrará notificaciones.
- NOTC-06: El fallo de la notificación NO romperá el comentario
  (log-and-continue).

## Criterios de aceptación
- [ ] Comentar reseña ajena genera notificación al autor.
- [ ] Notificación con texto correcto y link al comentario con anchor.
- [ ] Comentar la propia reseña no genera notificación.
- [ ] Múltiples comentarios → múltiples notificaciones.
- [ ] Editar/borrar no afectan notificaciones.
- [ ] Fallo de notificación no rompe el comentario.
- [ ] /perfil/notificaciones muestra los 3 tipos con iconos distintos.
- [ ] Tests de servidor: generación, no-auto, listado 3 tipos, regresiones.
- [ ] Test E2E: comentar → notificación → click → anchor.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de respuestas a comentarios
- Notificaciones de likes en reseñas
- Agrupación de notificaciones
- Preferencias (desactivar notificaciones de comentarios)
- Notificaciones al editar/borrar comentarios