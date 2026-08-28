# 012 — Reseñas

## Contexto
Feature L2. Permite a usuarios autenticados que ya valoraron una serie escribir
una reseña de 50-2000 caracteres. Las reseñas se publican directamente (sin
moderación previa), pero mod/admin puede eliminarlas. Requiere migración para
la tabla reseña + políticas RLS.

## Requisitos (EARS)
- RES-01: Cuando un usuario autenticado que ya valoró una serie envía una
  reseña de 50-2000 caracteres, el sistema deberá crearla y mostrarla en la
  ficha sin recargar.
- RES-02: Cuando un usuario intenta reseñar sin haber valorado, el sistema
  deberá rechazar la acción con mensaje "Debes valorar la serie antes de
  reseñarla".
- RES-03: Cuando un usuario edita su reseña, el sistema deberá actualizar el
  contenido y la fecha updated_at.
- RES-04: Cuando un usuario elimina su reseña, el sistema deberá borrarla
  (la valoración permanece intacta).
- RES-05: Cuando un visitante sin sesión ve la ficha, el formulario mostrará
  "Inicia sesión para reseñar" enlazando a /login con callback (AUTH-06).
- RES-06: Cuando un usuario autenticado sin valoración previa ve la ficha,
  el formulario mostrará "Debes valorar la serie antes de reseñarla" y un
  enlace o ancla al selector de valoración.
- RES-07: Un usuario solo puede tener una reseña por serie (UNIQUE user_id+serie_id).
- RES-08: La sección "Reseñas" mostrará todas las reseñas en orden cronológico
  descendente (más recientes primero), con autor (email truncado), fecha y contenido.
- RES-09: Un mod/admin puede eliminar cualquier reseña desde la ficha (botón
  visible solo para mod/admin).
- RES-10: La reseña tiene metadata SEO indirecta (no afecta title/description
  de la ficha por ahora; follow-up si se quiere rich snippets).

## Criterios de aceptación
- [ ] Usuario con valoración previa crea reseña → visible en ficha sin recargar.
- [ ] Usuario sin valoración → mensaje de rechazo + ancla al selector.
- [ ] Usuario edita su reseña → contenido actualizado, updated_at nuevo.
- [ ] Usuario elimina su reseña → desaparece; valoración intacta.
- [ ] Sin sesión → "Inicia sesión para reseñar" + callback.
- [ ] Mod/admin ve botón "Eliminar" en todas las reseñas y puede usarlo.
- [ ] User normal no ve botón "Eliminar" en reseñas de otros.
- [ ] UNIQUE constraint: segundo intento de reseña → error amigable.
- [ ] Tests de servidor: crear, editar, eliminar, rechazos, RLS.
- [ ] Test E2E Playwright: login → valorar → reseñar → editar → eliminar.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Moderación previa de reseñas (cola de aprobación)
- Votos útiles (helpful/upvote)
- Orden por relevancia/rating de reseña
- Paginación de reseñas
- Rich snippets / SEO específico de reseñas
- Reseñas con imágenes o markdown
