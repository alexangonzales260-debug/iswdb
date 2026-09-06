# 025 — Comentarios en reseñas · Tareas

- [x] T1 — Migración M19 + tipos + tests DB/RLS
  supabase/migrations/20260905170000_create_comentario.sql (M19): tabla
  comentario (id uuid PK gen_random_uuid() · "reseña_id" FK reseña on delete
  cascade · user_id FK usuario on delete cascade · contenido text not null
  CHECK char_length 1-1000 · created_at timestamptz not null default now()
  · SIN updated_at, SIN trigger, SIN UNIQUE) + índice "comentario_resena_ix"
  (reseña_id, created_at desc) + grants patrón M2 (select
  anon/authenticated/service_role; insert/update/delete
  authenticated/service_role) + RLS: "comentario_select_public" (using true,
  anon+authenticated) · "comentario_insert_own" (with check user_id =
  auth.uid()) · "comentario_update_own" (using + with check user_id =
  auth.uid()) · "comentario_delete_own" (using user_id = auth.uid()). Sin
  permisos para el autor de la reseña (decisión 5). Identificadores con ñ
  entre comillas dobles. Después: supabase db reset + npm run gen:types
  (types/database.ts incluye comentario; verificar .from('comentario')).
  tests/db/comentarios-rls.test.ts (invariantes + RLS en crudo): insert ok ·
  update own ok · update ajeno → 0 filas (fila intacta) · delete own ok ·
  delete ajeno → 0 filas · anon select público ok (select_public) · anon no
  inserta/update/delete (/permission denied|row-level security/i) · insert
  con user_id ajeno → denegado · CHECK 1/1000 ok, 0/1001 → violación de check
  · cascade borrar reseña → comentarios borrados · cascade borrar usuario →
  comentarios borrados (usuario creado con createTestUser; borrado con
  deleteTestUser; patrón listas-colaborativas-rls).
  Criterio: npm test -- --run tests/db/comentarios-rls.test.ts verde (BD
  local arriba).

- [x] T2 — Servicios en lib/comentarios.ts + tests
  lib/comentarios.ts (nuevo): ERRORES_COMENTARIO (sinSesion, reseñaNoEncontrada,
  comentarioNoEncontrado, sinPermiso, contenidoVacio, contenidoMuyLargo) ·
  contenidoSchema Zod trim min 1 max 1000 ·
  crearComentario(client, reseñaId, userId, contenido): Zod → reseña existe y
  pública (serie aprobada, patrón getPerfilPublico) → insert user_id = userId
  → retorna el comentario; reseña inexistente/no pública → reseñaNoEncontrada ·
  editarComentario(client, comentarioId, userId, contenido): update por id +
  user_id (RLS backstop); 0 filas → select de discriminación → sinPermiso
  (existe ajena) / comentarioNoEncontrado (inexistente); sin updated_at ·
  borrarComentario(client, comentarioId, userId): delete por id + user_id;
  misma discriminación ·
  listComentariosPorReseña(clientServiceRole, reseñaId, limit = 50): verifica
  reseña existe (→ reseñaNoEncontrada) → select embed usuario(username),
  order created_at desc, limit, filtro defensivo de null → ComentarioPublico[].
  lib/reseñas.ts: getReseña(clientServiceRole, id) → ReseñaDetalle | null con
  serie!inner (aprobada) + usuario(username); null → notFound en la página.
  tests/lib/comentarios.test.ts (db-backed, patrón reseñas.test.ts): crear ok y
  retorna fila · reseña inexistente → reseñaNoEncontrada · reseña de serie no
  aprobada → reseñaNoEncontrada · editar propio ok (contenido cambia,
  created_at intacto) · editar ajeno → sinPermiso · editar inexistente →
  comentarioNoEncontrado · contenido vacío (0 tras trim) → contenidoVacio ·
  1001 → contenidoMuyLargo · borrar propio ok · borrar ajeno → sinPermiso ·
  listar con username y orden desc (created_at explícitos) + limit · reseña
  inexistente en listar → reseñaNoEncontrada.
  Criterio: npm test -- --run verde.

- [x] T3 — Server Actions + página /reseñas/[id] + componentes + links
  lib/comentarios-actions.ts (nuevo, "use server"): accionCrearComentario
  (reseñaId, prev, formData) y accionEditarComentario (reseñaId, comentarioId,
  prev, formData) con useActionState + accionBorrarComentario (reseñaId,
  comentarioId) de llamada directa. Todas: requireUser({ next:
  `/reseñas/<id>`, message: ERRORES_COMENTARIO.sinSesion }) → createAuthClient
  → servicio con user.id → revalidatePath(`/reseñas/<id>`) → { error } en fallo.
  app/reseñas/[id]/page.tsx (nuevo, RSC, force-dynamic): getReseña(
  createServiceRoleClient(), id) → notFound() (404 antes del shell, patrón
  F004; generateMetadata consistente) · getUser() · listComentariosPorReseña(
  createServiceRoleClient(), id, 50) · render reseña completa (autor username,
  fecha Intl es-ES, contenido pre-wrap, link a /series/<slug>) + sección
  "Comentarios": form solo con sesión (anon → aviso de solo lectura, COM-04).
  components/comentario-form.tsx (nuevo, "use client"): textarea name=contenido
  maxLength 1000 + contador n/1000, useActionState, error role=alert; modo
  crear (página) o editar (prefilled en comentario-item).
  components/lista-comentarios.tsx (nuevo, "use client"): props { comentarios,
  userId } → map de comentario-item + empty state.
  components/comentario-item.tsx (nuevo, "use client"): username + fecha +
  contenido pre-wrap; si userId === autor.id → botones Editar (estado inline
  con form edición) y Borrar (useTransition + accionBorrarComentario);
  ajeno/anon → sin botones (COM-05).
  Links: components/reseñas-section.tsx añade Link por reseña →
  /reseñas/<id> (COM-07); app/usuarios/[username]/page.tsx (SeccionReseñas)
  añade Link por reseña → /reseñas/<id> (COM-08). /perfil sin cambios (no
  lista reseñas).
  Criterio: lint + typecheck + build verdes; smoke manual en dev: navegación
  /reseñas/<id> desde ficha y perfil, añadir/editar/borrar con sesión, anon
  solo lectura, ruta con ñ OK.

- [x] T4 — E2E Playwright
  e2e/global-setup.ts: wipe() añade delete de comentario ANTES de reseña.
  e2e/comentarios.spec.ts (nuevo; usuarios únicos por ejecución, cleanup
  deleteAuthUserByEmail → cascade): setup de A (createAuthUserWithUsuario) +
  reseña pública de A en e2e-01 insertada por service-role (≥50 chars) · sin
  sesión: /series/e2e-01 → link de la reseña navega a /reseñas/<id> (COM-07)
  → sección comentarios visible sin form (COM-04) · B inicia sesión → añade
  comentario → visible con su username → edita inline → contenido actualizado
  → borra → desaparece · C (ajeno) ve los comentarios de B sin botones
  Editar/Borrar (COM-05) · /usuarios/<username> de B → link a /reseñas/<id>
  navega (COM-08).
  Criterio: npm run test:e2e verde; sin regresiones.

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada, DoD) · ROADMAP.md (025 ✅) ·
  DECISIONS.md (D31: RLS select público / write own sin updated_at; página
  /reseñas/<id>; username con service-role; "reseña pública" = serie
  aprobada; sinPermiso vs comentarioNoEncontrado) · docs/memory/session-log.md
  (sesión F025) · commit atómico `F25: …` tras revisión del diff (DoD #4).
  Tag F25 solo con orden explícita (modelo F024).
  Criterio: Definition of Done completa.