# 010 — Admin: moderation dashboard · Tareas

- [x] T1 — Tests RLS rol mod (sin migración)
  tests/db/rls.test.ts: usuario mod nuevo (createTestUser + fila usuario rol
  'mod' + signInTestUser). mod: insert/update serie ok · insert episodio ok ·
  insert/update canal ok · insert/update/delete participa ok. user normal:
  insert serie/episodio/participa denegado · update serie y update/delete
  participa → 0 filas (fila intacta). anon: insert serie/episodio/participa
  denegado. Las políticas ya existen en M3 → no se crea migración.
  Criterio: npm test -- --run verde (BD local arriba).

- [x] T2 — lib/admin.ts: lecturas + moderación
  getRolUsuario(client, userId) · requireMod() (sin sesión o rol ∉ {mod,admin}
  → notFound(), ADM-04) · listSeriesPendientes (created_at asc) ·
  listTodasSeries (con moderation_status, created_at desc) · getSerieParaEditar
  (campos + participa con canal + episodios; null si no existe) · aprobarSerie
  / rechazarSerie (update moderation_status) · listCanales() en lib/canales.ts.
  tests/lib/admin.test.ts (fixture adm-*, usuarios mod/user): pendientes solo
  pendientes · todas incluye todos los estados · getSerieParaEditar con
  canales/episodios e inexistente → null · aprobar/rechazar mod ok · user y
  anon → error RLS.
  Criterio: npm test -- --run verde.

- [x] T3 — lib/admin.ts: crearSerie/editarSerie + Zod
  serieAdminSchema Zod (titulo mín 1, categoria slug existente, estado enum,
  años opcionales fin>=inicio, urls opcionales, canales[] canal_id+rol,
  episodios[] temporada/numero/titulo/video_id) · slugify + generarSlugUnico
  (sufijos -2, -3…) · crearSerie: insert serie → participa → episodio con
  COMPENSACIÓN (fallo hijo → delete serie por cascade; PostgREST no soporta
  inserts anidados, PGRST204 verificado; 23505 → error amigable) ·
  editarSerie: update campos (slug inmutable) → upsert/delete participa
  (onConflict serie_id,canal_id) → upsert/delete episodio (onConflict id).
  tests/lib/admin.test.ts (extender): creación completa · fallo en episodio →
  compensación (no queda serie) · titulo duplicado → slug con sufijo ·
  validaciones · edición campos + altas/bajas de canales y episodios ·
  episodio duplicado en edición → error amigable · user → RLS denegado.
  Criterio: npm test -- --run verde.

- [ ] T4 — lib/admin-actions.ts ("use server")
  Guard requireMod en cada action (ADM-04) · accionAprobarSerie /
  accionRechazarSerie → { error? } + revalidatePath('/', 'layout') ·
  accionCrearSerie / accionEditarSerie(slug, …) con useActionState: campos
  básicos + JSON de canales/episodios → servicio → redirect('/admin') en
  éxito, { error } en fallo.
  Criterio: lint + typecheck verdes; notFound() verificado dentro de action.

- [ ] T5 — UI: layout, páginas y componentes
  app/admin/layout.tsx (requireMod, cubre subrutas) · app/admin/page.tsx
  (cola pendientes + listado todas + botón nueva, ADM-01) ·
  app/admin/series/nueva/page.tsx · app/admin/series/[slug]/editar/page.tsx
  (notFound si no existe) · components/admin/serie-form.tsx ("use client":
  sub-formularios dinámicos canales/episodios + JSON oculto + useActionState)
  · components/admin/moderation-buttons.tsx ("use client": aprobar/rechazar
  con useTransition).
  Criterio: lint + typecheck + build verdes; smoke manual en dev.

- [ ] T6 — E2E Playwright
  e2e/global-setup.ts: createModUser(email) (auth user + fila usuario rol
  'mod'). e2e/admin.spec.ts (corre primero alfabéticamente; restaura al
  salir): anónimo → /admin → 404 · user normal → login → /admin y subruta →
  404 (ADM-04) · mod → login → /admin ve e2e-16 en cola → aprobar → visible
  en catálogo público → restaurar a pendiente (ADM-02) · crear serie por UI
  con canal+episodio → visible en catálogo → editar → verificar (ADM-05/06).
  afterAll: e2e-16 pendiente, borrar series creadas y usuarios.
  Criterio: npm run test:e2e verde sin regresiones.

- [ ] T7 — validate.sh + cierre
  ./validate.sh completo (salida pegada) · ROADMAP.md (010 → "Admin:
  moderation dashboard" ✅) · DECISIONS.md (aclarar D9: moderación en 010) ·
  docs/memory/session-log.md (sesión F010) · commit atómico `F10: …` tras
  revisión del diff (DoD #4).
  Criterio: Definition of Done completa.
