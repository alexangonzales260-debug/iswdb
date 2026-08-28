# 012 — Reseñas · Tareas

- [x] T1 — Migración M5 + tipos + tests DB/RLS
  supabase/migrations/<ts>_create_resena_table.sql: tabla "reseña" (id uuid
  PK gen_random_uuid(), user_id FK usuario cascade, serie_id FK serie
  cascade, contenido text not null CHECK char_length 50-2000, created_at/
  updated_at timestamptz default now(), unique(user_id, serie_id)) + trigger
  "reseña_set_updated_at" (set_updated_at, M1) + índice "reseña_serie_created
  _idx" (serie_id, created_at desc) + grants patrón M2 + RLS: "reseña_select
  _public" (using true, anon+authenticated), "reseña_insert_own" (with check
  user_id = auth.uid()), "reseña_update_own" (using + with check), "reseña_
  delete_own_or_mod" (user_id = auth.uid() or is_admin_or_mod()).
  Identificadores con ñ entre comillas dobles. Después: supabase db reset +
  npm run gen:types (types/database.ts incluye reseña; verificar
  .from('reseña')).
  tests/db/reseñas.test.ts (invariantes + RLS en crudo): límites 50/2000 ok
  · 49/2001 → violación de check · duplicado → 23505 · trigger updated_at ·
  anon lee ok / INSERT-UPDATE-DELETE denegados · insert con user_id ajeno
  denegado · update/delete de no dueño no mod → 0 filas (fila intacta) ·
  mod/admin borran cualquier reseña · mod no edita la de otro.
  Criterio: npm test -- --run tests/db/reseñas.test.ts verde (BD local arriba).

- [x] T2 — Servicios en lib/reseñas.ts + tests
  Migración M6 (decisión 11 del plan): public.usuario.email nullable +
  backfill desde auth.users (el email del autor no existía en el esquema
  público); seed.sql añade email a las filas de usuario; registrarUsuario y
  getPerfilData (lib/auth.ts) rellenan la columna.
  lib/reseñas.ts (nuevo): ERRORES_RESEÑA · Zod contenido (trim, 50-2000) ·
  crearReseña(client, serieSlug, contenido): Zod → sesión → serie por slug
  (inexistente o no aprobada → rechazo, estilo VAL-07) → valoración previa
  (RES-02 server-side) → insert (23505 → error amigable de duplicado) ·
  editarReseña(client, reseñaId, contenido): propiedad vía update por id +
  user_id (0 filas → error) · eliminarReseña(client, reseñaId): RLS
  own_or_mod (0 filas → sin permiso) ·   getReseñaUsuario(client, serieId, userId) → { id, contenido } | null ·
  listReseñasSerie(clientServiceRole, serieId): created_at desc, embed
  usuario(id, email), filtro defensivo de nulls.
  lib/supabase.ts: createServiceRoleClient() perezoso (env
  SUPABASE_SERVICE_ROLE_KEY, server-only). .env.example/.env.local: clave
  demo estándar local.
  tests/db/reseñas.test.ts (extender): crear con valoración previa ok · sin
  valoración → RES-02 · serie no aprobada → rechazo · longitudes inválidas
  (49/2001) · duplicado → error amigable · sin sesión · editar actualiza
  contenido y updated_at · editar ajena → rechazado · eliminar por dueño →
  valoración intacta (aserción explícita, RES-04) · no dueño no mod →
  rechazado · mod/admin borran ajena ok · getReseñaUsuario existente/
  inexistente · listReseñasSerie orden desc (created_at explícitos) + embed
  email.
  tests/lib/format.test.ts (nuevo): truncarEmail (local part normal, corto,
  límite).
  Criterio: npm test -- --run verde.

- [x] T3 — Server Actions + componentes + ficha
  lib/reseñas-actions.ts (nuevo, "use server"): accionCrearReseña(serieSlug,
  prev, formData) / accionEditarReseña(serieSlug, reseñaId, prev, formData)
  con Zod + requireUser({ next, message }) (AUTH-06) + servicio +
  revalidatePath(`/series/<slug>`) · accionEliminarReseña(reseñaId,
  serieSlug) de llamada directa. En fallo devuelven { error }.
  components/reseña-form.tsx (nuevo, "use client"): props { serieSlug,
  conSesion, haValorado, reseñaPropia }. Sin sesión → "Inicia sesión para
  reseñar" → /login?next&msg (RES-05) · sesión sin valoración → mensaje +
  ancla #valoraciones-heading (RES-06) · creación (textarea name=contenido,
  maxLength 2000, contador n/2000, useActionState, error role=alert) · con
  reseña propia → edición inline prefilled.
  components/reseñas-section.tsx (nuevo, RSC): getUser + getValoracionUsuario
  + getReseñaUsuario + listReseñasSerie + getRolUsuario (lib/admin.ts); lista
  desc con truncarEmail, fecha Intl es-ES, contenido pre-wrap, empty state;
  botón Eliminar (dueño o mod/admin) vía components/reseña-delete-button.tsx
  (nuevo, "use client", useTransition + router.refresh()); formulario antes
  de la lista.
  lib/format.ts: truncarEmail. app/series/[slug]/page.tsx: <ReseñasSection
  serie={serie} /> tras Valoraciones.
  Criterio: lint + typecheck + build verdes; smoke manual en dev (crear/
  editar/eliminar con sesión; estados RES-05/RES-06; botón mod).

- [x] T4 — E2E Playwright
  e2e/global-setup.ts: añadir reseña al wipe().
  e2e/resenas.spec.ts (nuevo; usuarios únicos por ejecución, cleanup
  deleteAuthUser → cascade): flujo login → ficha e2e-01 → mensaje RES-06 +
  ancla → valorar 8 → reseñar (≥50 chars, contador visible) → visible en la
  lista sin recarga (contador de eventos load) → editar → guardar → contenido
  actualizado → eliminar (dueño) → desaparece y valoración intacta ("8.0 · 1
  valoración") · anónimo → "Inicia sesión para reseñar" con next+msg
  (RES-05) · mod: usuario A escribe reseña → "Salir" → login mod
  (createModUser) → ve "Eliminar" en la reseña de A → la borra → desaparece ·
  user normal B no ve "Eliminar" en la reseña de A.
  Criterio: npm run test:e2e verde; sin regresiones (resenas corre antes que
  valoraciones; el cleanup restaura e2e-01).

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada) · ROADMAP.md (012 ✅) ·
  DECISIONS.md (D18: publicación directa sin moderación previa; borrado
  own_or_mod; lectura service-role para el embed del email del autor) ·
  docs/memory/session-log.md (sesión F012) · commit atómico `F12: …` tras
  revisión del diff (DoD #4).
  Criterio: Definition of Done completa.
