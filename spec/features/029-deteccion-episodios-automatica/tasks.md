# 029 — Detección y sugerencia automática de episodios nuevos · Tareas

- [x] T1 — Migración M24 + tipos + tests DB/RLS
  supabase/migrations/20260915120000_create_episodio_sugerencia.sql (M24):
  tabla "episodio_sugerencia" (id uuid PK default gen_random_uuid() ·
  serie_id FK serie on delete cascade · video_id_youtube text not null ·
  titulo_detectado text CHECK 1-255 · descripcion text · estado text
  default 'pendiente' CHECK ('pendiente'|'aprobado'|'rechazado') ·
  fecha_deteccion timestamptz default now() · detectado_por text default
  'servicio' · temporada_detectada int default 1 CHECK >= 1 ·
  numero_detectado int CHECK (null o >= 1) · created_at timestamptz ·
  updated_at timestamptz con trigger set_updated_at · UNIQUE(serie_id,
  video_id_youtube)) + índices episodio_sugerencia_serie_idx (serie_id,
  estado) + episodio_sugerencia_estado_fecha_idx (estado, fecha_deteccion desc)
  + grants a authenticated y service_role (SIN anon) + RLS mod-only:
  "episodio_sugerencia_select_mod" (select authenticated using
  public.is_admin_or_mod()) · "episodio_sugerencia_insert_mod" (insert
  authenticated with check public.is_admin_or_mod()) ·
  "episodio_sugerencia_update_mod" (update authenticated using/with check
  public.is_admin_or_mod()) · "episodio_sugerencia_delete_mod" (delete
  authenticated using public.is_admin_or_mod()) · **SIN políticas para
  usuarios estándar ni anónimos**.
  Después: supabase db reset + npm run gen:types (types/database.ts incluye
  episodio_sugerencia; verificar .from('episodio_sugerencia')).
  tests/db/episodio-sugerencia-rls.test.ts (invariantes + RLS en crudo):
  mod insert ok, select ok, update ok, delete ok · usuario estándar
  (no-mod) insert denegado/0 filas, select 0 filas, update 0 filas, delete
  0 filas · anon denegado en select e insert · UNIQUE(serie_id,
  video_id_youtube) rechaza duplicados con 23505 · cascade al borrar serie
  elimina sus sugerencias asociadas.
  Criterio: npm test -- --run tests/db/episodio-sugerencia-rls.test.ts verde
  (BD local arriba).

- [x] T2 — Lógica de matching lib/episodio-deteccion.ts + lib/youtube.ts + tests
  lib/episodio-deteccion.ts (nuevo, funciones puras y servicios):
  detectarPatronEpisodio(titulo, descripcion): extrae temporada, número y
  título limpio soportando S01E02, 1x02, Capítulo 3, Cap. 3, Ep. 4, Episodio 5
  y numerales.
  crearSugerencia(client, datos): inserta sugerencia en estado 'pendiente'.
  listSugerenciasPendientes(client): select con estado 'pendiente' y serie
  asociada (mod-only).
  aprobarSugerencia(client, sugerenciaId, overrides?): inserta fila en
  episodio y actualiza estado a 'aprobado'.
  rechazarSugerencia(client, sugerenciaId): update estado a 'rechazado'.
  eliminarSugerencia(client, sugerenciaId): delete mod-only.
  lib/youtube.ts (nuevo/extensión server-side): cliente YouTube Data API v3
  server-side seguro para consultar vídeos recientes por canal o playlist.
  tests/lib/episodio-deteccion.test.ts (unitario + db-backed): test de
  expresiones regulares con casos reales · aprobar sugerencia crea episodio
  en serie · rechazar sugerencia no crea episodio · duplicado de video_id_youtube
  rechazado · usuario no-mod no puede gestionar sugerencias.
  Criterio: npm test -- --run tests/lib/episodio-deteccion.test.ts verde.

- [x] T3 — Server Actions + cola /admin/sugerencias + navegación
  lib/episodio-deteccion-actions.ts (nuevo, "use server"):
  accionAprobarSugerencia(sugerenciaId, formData) con requireMod →
  aprobarSugerencia → revalidatePath('/admin/sugerencias') y ficha de serie.
  accionRechazarSugerencia(sugerenciaId) con requireMod → rechazarSugerencia
  → revalidatePath('/admin/sugerencias').
  accionEliminarSugerencia(sugerenciaId) con requireMod → eliminarSugerencia
  → revalidatePath('/admin/sugerencias').
  components/admin/sugerencia-actions.tsx (nuevo, "use client"): botones
  "Aprobar", "Rechazar" y "Eliminar" con useTransition y manejo de error.
  app/admin/sugerencias/page.tsx (nuevo, RSC force-dynamic, requireMod):
  cola de sugerencias pendientes con preview de vídeo, título detectado,
  serie vinculada y acciones de moderación.
  app/admin/layout.tsx: añadir enlace "Sugerencias" en el menú de navegación
  de moderación.
  Criterio: lint + typecheck + build verdes; smoke manual.

- [ ] T4 — E2E Playwright
  e2e/global-setup.ts: wipe() añade delete de episodio_sugerencia antes de
  serie por FK cascade.
  e2e/deteccion-episodios.spec.ts (nuevo; usuarios únicos por ejecución):
  usuario sin sesión o no-mod entra a /admin/sugerencias → 404 · mod
  inicia sesión y accede a /admin/sugerencias · ve sugerencia pendiente ·
  mod aprueba la sugerencia → sugerencia desaparece de pendientes y
  episodio aparece en la ficha pública de la serie · mod rechaza otra
  sugerencia → queda rechazada sin crear episodio.
  Criterio: npm run test:e2e verde; sin regresiones.

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada, DoD) · ROADMAP.md (029 ✅) ·
  DECISIONS.md (D35: tabla episodio_sugerencia M24, RLS mod-only, parser de
  patrones lib/episodio-deteccion.ts, extensión server-side lib/youtube.ts,
  cola de moderación /admin/sugerencias, sin notificaciones/historial/rate-limiting)
  · docs/memory/session-log.md (sesión F029) · commit atómico `F29: …` tras
  revisión del diff (DoD #4). Tag F29 solo con orden explícita (modelo F024).
  Criterio: Definition of Done completa.
