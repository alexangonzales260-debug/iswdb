# 005 — Ficha de canal · Tareas

- [x] T0 — Specs
  spec/features/005-ficha-canal/spec.md (texto aprobado, verbatim) ·
  plan.md (decisiones aprobadas: CastList → /canales/<handle>, description con
  rol de mayor jerarquía y singularización, orden anio desc/null al final →
  activa antes que finalizada → valoración desc → created_at desc) ·
  tasks.md (este archivo).
  Criterio: archivos escritos; sin código.

- [x] T1 — Query getCanalByHandle + tests de servidor
  lib/series.ts: exportar toRating (sin cambios de lógica) · lib/format.ts:
  etiquetaRol(rol) mudado desde cast-list.tsx · components/cast-list.tsx:
  importa etiquetaRol de lib/format · lib/canales.ts (nuevo): tipos
  SerieFilmografia extends SerieCard { estado }, FilmografiaSerie { serie,
  rol }, CanalFichaData { nombre, handle, avatar_url, series } ·
  CANAL_FICHA_SELECT con participa(rol, serie!inner(id, titulo, slug,
  portada_url, anio_inicio, created_at, estado, categoria(nombre,slug),
  participa(canal(nombre,handle)), valoracion(nota))) · getCanalByHandle con
  .eq('handle',handle).eq('participa.serie.moderation_status','aprobada')
  .maybeSingle() → null si no hay fila o participa vacía · orden byFilmografia
  en TS · rolDestacado(series) por jerarquía.
  tests/lib/canales.test.ts (nuevo, seed propio fc-*/@iswdb-fc-*): canal con
  5 series → orden [fc-03, fc-02, fc-04, fc-01, fc-05] + rol por serie +
  rating + categoria + canales completos en fc-03 · canal solo con serie
  pendiente → null · canal sin participaciones → null · handle inexistente →
  null · rolDestacado.
  Criterio: `npm test -- --run` verde (suite completa, BD local arriba).

- [x] T2 — Ruta /canales/[handle] + UI
  app/canales/[handle]/page.tsx (nuevo, RSC): force-dynamic ·
  generateMetadata (await params → getCanalByHandle → notFound() si null;
  title: nombre, description "<nombre> en ISWDB: N serie(s) como <Rol>."
  singularizada con rolDestacado, canonical /canales/<handle>, OG images solo
  con avatar) · page con query previa al render y notFound() antes del shell ·
  cabecera (avatar circular next/image priority o placeholder User, h1 nombre,
  handle, conteo singularizado) · sección "Filmografía" (h2) con grid de
  /series: Badge de rol sobre la portada (absolute, pointer-events-none) +
  <SerieCard> reutilizado · components/cast-list.tsx: Link → /canales/<handle>.
  Criterio: lint + typecheck + build verdes; smoke manual con seed temporal.

- [ ] T3 — E2E Playwright
  e2e/global-setup.ts (aditivo): avatar_url en '@canal-dos' · FIXTURE.roles
  con '@canal-uno' principal en e2e-09 · canal '@canal-tres' participando solo
  en e2e-16 (pendiente) · e2e-02 con anio_inicio 2025.
  e2e/canal.spec.ts (nuevo): /series?page=2 → ficha e2e-01 → click en Canal
  Dos del reparto → /canales/@canal-dos (h1, conteo) · /canales/@canal-uno:
  orden [e2e-02, e2e-13, e2e-09, e2e-05] + badge "Principal" · metadata:
  <title> "Canal Uno · ISWDB", description "Canal Uno en ISWDB: 4 series como
  Principal.", og:image en @canal-dos · /canales/@canal-tres y
  /canales/@no-existe → 404.
  e2e/ficha.spec.ts: href del reparto → '/canales/@canal-dos'.
  Criterio: `npm run test:e2e` verde (catálogo + ficha sin regresiones).

- [ ] T4 — Lighthouse + cierre
  Seed temporal con avatar real → Lighthouse manual en /canales/<handle>
  (Perf ≥90, SEO 100, A11y ≥95; evidencia pegada) → borrar seed ·
  ./validate.sh completo en verde (evidencia pegada) · ROADMAP.md (005 ✅) ·
  docs/memory/session-log.md (incluye cambio de link del reparto respecto a
  FIC-05) · Commit de cierre: `F5: …`.
  Criterio: Definition of Done completa.
