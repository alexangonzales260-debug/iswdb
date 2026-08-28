# 006 — Búsqueda · Tareas

- [x] T0 — Specs
  spec/features/006-busqueda/spec.md (texto aprobado, verbatim) · plan.md
  (decisiones aprobadas: filtrado SQL vía funciones RPC buscar_series/
  buscar_canales con unaccent + escape de comodines; orden de series igual
  que /series con WR desc y canales nombre A→Z; solo secciones no vacías;
  formulario GET del header sin prefill; title vía template del layout) ·
  tasks.md (este archivo).
  Criterio: archivos escritos; sin código.

- [x] T1 — Migración (unaccent + RPC) + tipos
  supabase/migrations/<ts>_enable_unaccent_search.sql: create extension if
  not exists unaccent with schema extensions · public.buscar_series(q)
  returns setof serie (aprobadas cuyo título coincide O participa un canal
  cuyo nombre/handle coincide; patron = '%'+unaccent(btrim(q)) con \, %, _
  escapados+'%') · public.buscar_canales(q) returns setof canal (con ≥1
  serie aprobada y nombre/handle coincidente; order by nombre) · ambas
  language sql stable, set search_path = public, extensions.
  supabase db reset + npm run gen:types.
  Criterio: db reset verde; types/database.ts incluye buscar_series y
  buscar_canales; smoke psql con evidencia pegada.

- [x] T2 — lib/busqueda.ts + tests de servidor
  lib/series.ts: exportar SERIE_SELECT, toSerieCard y byWrDesc (sin cambios
  de lógica) · lib/busqueda.ts (nuevo): buscarSeries(q) → rpc + select
  SERIE_SELECT + orden byWrDesc(getGlobalMeanRating) + toSerieCard ·
  buscarCanales(q) → rpc → CanalResultado { id, nombre, handle, avatar_url }
  · término vacío → [] sin consultar.
  tests/lib/busqueda.test.ts (nuevo, seed propio bs-*/@iswdb-bs-*): por
  título ('marbella' → Marbella Vice; bs-03 pendiente excluida aunque
  coincide) · mayúsculas ('MARBELLA') · sin acentos ('cafe tactico' → Café
  Táctico; 'café') · por nombre/handle de canal → series del canal · canal
  que solo participa en pendiente → [] · sin resultados → [] · escape de
  comodines ('%' y '_' → []) · buscarCanales: solo canales con ≥1 aprobada
  (Canal BS Dos/Tres → []) y acentos ('cafe canal' → Café Canal).
  Criterio: `npm test -- --run` verde (suite completa, BD local arriba).

- [ ] T3 — Ruta /buscar + barra del header
  app/buscar/page.tsx (nuevo, RSC): force-dynamic · searchParams Promise ·
  generateMetadata title `Búsqueda: <q>` (sin q → "Buscar") + description +
  canonical/OG · sin q → hint "Busca por título de serie o nombre de canal"
  (BUS-04) · con q → secciones "Series" (grid de /series con SerieCard) y
  "Canales" (avatar + nombre + handle con '@', link /canales/<handle> sin
  '@' por D15), solo las no vacías · ambas vacías → EmptyState "Sin
  resultados para '<q>'" + link /series (BUS-05).
  components/header.tsx: formulario GET role="search" action="/buscar",
  input type="search" name="q" con aria-label, botón con icono Search; cero
  JS cliente (BUS-06).
  Criterio: lint + typecheck + build verdes; smoke manual con seed temporal.

- [ ] T4 — E2E Playwright
  e2e/busqueda.spec.ts (nuevo; sin cambios en el fixture global): / → barra
  del header con 'Canal Dos' → /buscar?q=… → sección "Series" (Serie e2e 1,
  Serie e2e 9) + sección "Canales" (link /canales/canal-dos) → click en
  tarjeta → /series/e2e-01 · 'CANAL DOS' → mismos resultados (mayúsculas) ·
  /buscar sin q → hint · /buscar?q=zzzzzz → EmptyState + link /series ·
  <title> "Búsqueda: Canal Dos · ISWDB".
  Criterio: `npm run test:e2e` verde (sin regresiones en catalogo, ficha,
  canal, valoraciones, auth).

- [ ] T5 — Lighthouse + cierre
  Lighthouse manual en /buscar?q=<término> (Perf ≥90, SEO 100, A11y ≥95;
  evidencia pegada) · ./validate.sh completo en verde (evidencia pegada) ·
  ROADMAP.md (006 ✅) · docs/memory/session-log.md · Commit de cierre:
  `F6: …`.
  Criterio: Definition of Done completa.
