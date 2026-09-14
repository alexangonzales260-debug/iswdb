# 028 — Reportes de contenido · Tareas

- [x] T1 — Migración M22 + tipos + tests DB/RLS
  supabase/migrations/20260914120000_create_reporte.sql (M22): tabla
  "reporte" (id uuid PK default gen_random_uuid() · reportador_id FK
  usuario on delete cascade · tipo text CHECK ('serie'|'episodio'|
  'reseña'|'comentario') · serie_id/episodio_id/"reseña_id"/comentario_id
  FK nullable on delete cascade · motivo text CHECK 1-2000 · estado text
  default 'pendiente' CHECK ('pendiente'|'revisado'|'descartado') ·
  created_at timestamptz · CHECK de consistencia reporte_consistencia:
  exactamente una FK según tipo · SIN updated_at · SIN trigger) + índices
  reporte_reportador_idx (reportador_id, created_at desc) +
  reporte_mod_estado_idx (estado, created_at desc) + grants patrón M2
  (select/insert/update/delete authenticated+service_role; SIN anon) +
  RLS flag 5: "reporte_insert_own" (insert authenticated with check
  reportador_id = auth.uid()) · "reporte_select_own_or_mod" (select
  authenticated using reportador_id = auth.uid() OR
  public.is_admin_or_mod()) · "reporte_update_mod" (update authenticated
  using/with check public.is_admin_or_mod()) · "reporte_delete_mod"
  (delete authenticated using public.is_admin_or_mod()) · **SIN políticas
  update/delete para el reportador own**.
  Después: supabase db reset + npm run gen:types (types/database.ts
  incluye reporte; verificar .from('reporte')).
  tests/db/reporte-rls.test.ts (invariantes + RLS en crudo): insert ok con
  reportador_id = auth.uid() · si reportador_id ajeno → 23503 FK o RLS ·
  **update/delete de CUALQUIER fila por un no-mod (incluida la propia) →
  0 filas** · reportador lee solo sus propios reportes · mod lee todos,
  update estado ok, delete ok · anon sin insert ni select (denegado) ·
  CHECK de consistencia tipo↔FK (combinaciones inválidas rechazadas) ·
  motivo vacío/len>2000 rechazado · cascade borrar contenido (serie/
  episodio/reseña/comentario) → reportes borrados · cascade borrar usuario
  → reportes borrados (patrón likes-rls.test.ts).
  Criterio: npm test -- --run tests/db/reporte-rls.test.ts verde (BD local
  arriba).

- [ ] T2 — Servicios lib/reportes.ts + tests
  lib/reportes.ts (nuevo, patrón F012/F018 inyectable):
  crearReporte(client, { tipo, idObjetivo, motivo }, usuarioId): insert
  reporte con reportador_id = auth.uid().
  listMisReportes(client, usuarioId): select own (RLS).
  listReportesPendientes(client): mod, select estado='pendiente'.
  actualizarEstadoReporte(client, reporteId, estado, usuarioId): update
  restringido por RLS mod-only.
  eliminarReporte(client, reporteId, usuarioId): delete mod-only.
  Enriquecimiento on-read del contenido reportado (serie/episodio/reseña/
  comentario) con service-role.
  tests/lib/reportes.test.ts (db-backed, patrón reseñas.test.ts): crear
  ok · error motivo vacío/len>2000 · listar propios · mod lee todos ·
  mod actualiza estado · mod borra · user no-mod no actualiza ni borra
  (0 filas) · no-mod no lee ajenos · cascade.
  Criterio: npm test -- --run tests/lib/reportes.test.ts verde.

- [ ] T3 — Server Actions + componente Reportar + cola /admin
  lib/reportes-actions.ts (nuevo, "use server"): accionCrearReporte(tipo,
  idObjetivo, motivo, prev, formData) con requireUser + Zod motivo 1-2000
  → crearReporte → revalidatePath acotado. accionActualizarEstadoReporte
  (mod-only, requireMod) → actualizarEstadoReporte → revalidate /admin/
  reportes. accionEliminarReporte (mod-only).
  components/reportar-button.tsx (nuevo, "use client"): botón "Reportar"
  deshabilitado sin sesión; abre inline form de motivo (1-2000) y envía la
  action.
  app/admin/reportes/page.tsx (nuevo, RSC force-dynamic, requireMod):
  cola de reportes pendientes con select estado + botón borrar.
  Integración: botón Reportar en ficha de serie, episodio, /resenas/<id>
  y cada comentario.
  Criterio: lint + typecheck + build verdes; smoke manual.

- [ ] T4 — E2E Playwright
  e2e/global-setup.ts: wipe() añade delete de reporte (o se cubre por
  cascade al borrar contenido origen; revisar y dejar explícito).
  e2e/reportes-contenido.spec.ts (nuevo; usuarios únicos por ejecución,
  cleanup deleteAuthUserByEmail → cascade): sin sesión → botón Reportar
  no visible/disabled · user A inicia sesión y reporta la serie e2e-01
  con motivo → feedback ok · A no ve botón de borrar su reporte y ni
  siquiera puede (no hay UI propia) · user no-mod no ve /admin/reportes
  (404) · mod (creado vía service-role) entra a /admin/reportes, ve el
  reporte pendiente, lo marca revisado · mod borra reporte.
  Criterio: npm run test:e2e verde; sin regresiones.

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada, DoD) · ROADMAP.md (028 ✅) ·
  DECISIONS.md (D34: tabla reporte M22, RLS flag 5 own/mods, update/
  delete mod-only sin camino own, discriminador tipo + FK parcial con
  CHECK, sin notificaciones/historial/rate-limiting) ·
  docs/memory/session-log.md (sesión F028) · commit atómico `F28: …` tras
  revisión del diff (DoD #4). Tag F28 solo con orden explícita (modelo
  F024).
  Criterio: Definition of Done completa.