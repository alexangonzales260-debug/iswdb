# 027 — Likes en reseñas · Tareas

- [ ] T1 — Migración M21 + tipos + tests DB/RLS
  supabase/migrations/20260910120000_create_resena_like.sql (M21): tabla
  "reseña_like" ("reseña_id" FK reseña on delete cascade · user_id FK
  usuario on delete cascade · created_at timestamptz not null default now()
  · UNIQUE("reseña_id", user_id) · SIN id uuid PK · SIN updated_at · SIN
  trigger) + índice "reseña_like_resena_idx" ("reseña_id") +
  "reseña_like_user_idx" (user_id) + grants patrón M2 (select
  anon/authenticated/service_role; insert/delete
  authenticated/service_role) + RLS: "reseña_like_select_public" (using
  true, anon+authenticated) · "reseña_like_insert_own" (with check user_id
  = auth.uid()) · "reseña_like_delete_own" (using user_id = auth.uid()).
  Sin update. Después: supabase db reset + npm run gen:types
  (types/database.ts incluye reseña_like; verificar
  .from('reseña_like')).
  tests/db/likes-rls.test.ts (invariantes + RLS en crudo): insert ok ·
  duplicado (UNIQUE) → 23505 · delete own ok · delete ajeno → 0 filas ·
  anon select público ok (select_public) · anon no inserta/delete
  (/permission denied|row-level security/i) · insert con user_id ajeno →
  denegado · cascade borrar reseña → likes borrados · cascade borrar
  usuario → likes borrados (usuario creado con createTestUser; borrado con
  deleteTestUser; patrón comentarios-rls.test.ts).
  Criterio: npm test -- --run tests/db/likes-rls.test.ts verde (BD local
  arriba).

- [ ] T2 — Servicios en lib/likes.ts + integración en lib/reseñas.ts + tests
  lib/likes.ts (nuevo): servicios inyectables (patrón F012/F018).
  darLike(client, reseñaId, userId): insert reseña_like; 23505 →
  idempotente (silenciado, patrón D24 seguirSerie).
  quitarLike(client, reseñaId, userId): delete por reseña_id + user_id;
  idempotente (0 filas no es error).
  likesPorReseñas(clientServiceRole, reseñaIds: string[]): Map
  reseñaId → count. Select reseña_id, eq in(reseñaIds), group by
  reseña_id. Requiere service-role por consistencia con listReseñasSerie.
  likesPropios(client, reseñaIds: string[], userId): Set de reseñaIds
  con like propio. Select reseña_id, eq user_id + in(reseñaIds). userId
  null → Set vacío.
  lib/reseñas.ts: listReseñasSerie(clientServiceRole, serieId, userId?):
  parámetro opcional. Después de obtener reseñas, llama likesPorReseñas
  + likesPropios (si userId) en paralelo. Cada reseña gana numLikes
  (number) y yaDisteLike (boolean). getReseña(clientServiceRole,
  reseñaId, userId?): mismo patrón para una sola reseña.
  ReseñaPublica y ReseñaDetalle se extienden con numLikes: number y
  yaDisteLike: boolean.
  tests/lib/likes.test.ts (db-backed, patrón reseñas.test.ts): darLike ok
  y retorna fila · duplicado → idempotente (no error) · quitarLike ok ·
  quitar inexistente → idempotente · likesPorReseñas retorna Map con
  conteos correctos · likesPropios retorna Set correcto · userId null →
  Set vacío · cascade borrar reseña → likes borrados · cascade borrar
  usuario → likes borrados.
  tests/lib/reseñas.test.ts (extendido): listReseñasSerie con userId →
  numLikes/yaDisteLike presentes · sin userId → numLikes presente,
  yaDisteLike false · getReseña con/sin userId.
  Criterio: npm test -- --run verde.

- [ ] T3 — Server Actions + like-button.tsx + integración UI
  lib/likes-actions.ts (nuevo, "use server"): accionToggleLike(reseñaId,
  serieSlug, reseñaPageId?, prev, formData) o accionDarLike/accionQuitarLike.
  requireUser({ next: /resenas/<id> o /series/<slug>, message: 'Inicia
  sesión para votar' }) → user.id → createAuthClient → servicio
  (darLike/quitarLike) → revalidatePath acotado: /resenas/${reseñaPageId}
  (si existe) + /series/${serieSlug}. En fallo → { error }.
  components/like-button.tsx (nuevo, "use client"): props { reseñaId,
  numLikesInicial, yaDisteLikeInicial, serieSlug, conSesion }. Estado
  local: numLikes (number), yaDisteLike (boolean). Toggle optimista:
  flip yaDisteLike ±1 numLikes → startTransition con action → si error →
  revert. Sin sesión: botón disabled con title "Inicia sesión para votar";
  contador visible. Icono ThumbsUp de lucide-react + contador. Botón
  Button de shadcn (patrón FollowButton).
  components/reseñas-section.tsx: en cada <li> de reseña, renderizar
  <LikeButton> con los valores de listReseñasSerie (numLikes, yaDisteLike,
  conSesion = user !== null). Después del Link "Comentar".
  app/resenas/[id]/page.tsx: renderizar <LikeButton> con los valores de
  getReseña (numLikes, yaDisteLike, conSesion = user !== null). Después
  del contenido de la reseña, antes de la sección de comentarios.
  Criterio: lint + typecheck + build verdes; smoke manual en dev: botón
  "Útil" visible con contador en ficha y en /resenas/<id>, toggle con
  sesión, deshabilitado sin sesión.

- [ ] T4 — E2E Playwright
  e2e/global-setup.ts: wipe() añade delete de reseña_like ANTES de reseña.
  e2e/likes-resenas.spec.ts (nuevo; usuarios únicos por ejecución, cleanup
  deleteAuthUserByEmail → cascade): setup de A (createAuthUserWithUsuario)
  + reseña pública de A en e2e-01 insertada por service-role (≥50 chars) ·
  sin sesión: /series/e2e-01 → contador visible (0) y botón "Útil"
  deshabilitado · B inicia sesión → da like → contador 1 y botón activo ·
  B quita like → contador 0 y botón inactivo · A da like a su propia
  reseña → contador 1 (auto-like, LIKE-07) · doble click rápido no
  duplica (UNIQUE idempotente).
  Criterio: npm run test:e2e verde; sin regresiones.

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada, DoD) · ROADMAP.md (027 ✅) ·
  DECISIONS.md (D33: tabla reseña_like M21, RLS select público / insert+delete
  own, numLikes/yaDisteLike con parámetro opcional userId, auto-like
  permitido, sin notificaciones/orden/downvote) ·
  docs/memory/session-log.md (sesión F027) · commit atómico `F27: …` tras
  revisión del diff (DoD #4). Tag F27 solo con orden explícita (modelo
  F024).
  Criterio: Definition of Done completa.
