# 006 — Búsqueda · Plan técnico

## Decisiones adoptadas (aprobadas)
1. **Filtrado SQL vía funciones RPC**: el builder de supabase-js no puede
   invocar funciones dentro de los filtros (`.ilike()` solo acepta columna +
   valor), así que "ILIKE + unaccent en SQL" requiere objetos SQL. Aprobado:
   la migración única crea la extensión unaccent + `public.buscar_series(q)`
   y `public.buscar_canales(q)` (`language sql`, `stable`, SECURITY INVOKER
   por omisión, `set search_path = public, extensions`), ambas
   `returns setof` de la tabla base. El predicado completo vive en SQL:
   `extensions.unaccent(col) ilike '%' || patron || '%'` donde patron es
   `extensions.unaccent(btrim(q))` con los comodines `\`, `%`, `_` escapados
   (replace en ese orden: primero `\` para no re-escapar los escapes
   posteriores). Descartadas: computed fields (el OR título↔canal vía join
   no cabe en el builder y los tipos generados no los reconocen como
   columnas) y filtrado en TS (contradice la decisión "Filtrado en SQL").
2. **Orden de series en resultados**: el mismo que /series (VAL-05): WR desc
   (sin valoración → 0, al final), desempate created_at desc. Se reutilizan
   `getGlobalMeanRating` y `byWrDesc` de lib/series.ts, que se exportan sin
   cambios de lógica (precedente F005: export de toRating). Canales: siempre
   nombre A→Z (`order by` dentro de la función).
3. **Secciones**: solo se renderizan las secciones con resultados; si ambas
   están vacías → EmptyState BUS-05. Interpretación de BUS-01: mostrar una
   sección vacía junto a una con resultados es ruido; el empty state global
   cubre el caso "sin resultados".
4. **Barra del header**: formulario GET puro de servidor
   (`action="/buscar"`, `input name="q"`, `role="search"`), sin JS cliente
   (BUS-06). Sin prefill del término en /buscar: el layout no recibe
   searchParams y el prefill requeriría useSearchParams (cliente), vetado
   por BUS-06.
5. **Metadata (BUS-08)**: generateMetadata devuelve `title: "Búsqueda: <q>"`
   y el template del layout `"%s · ISWDB"` (app/layout.tsx) compone el title
   final. Sin q → title "Buscar".
6. **Normalización de q**: trim en servidor; vacío/blank → rama de hint
   (BUS-04), sin tocar la BD; tope defensivo de 100 caracteres.
7. **Links de canal**: /canales/<handle> sin '@' (D15, handleParaUrl); el
   handle visible en la fila conserva su '@'.
8. **RPC por POST**: unaccent es STABLE (no IMMUTABLE); PostgREST solo
   expone por GET funciones inmutables, pero supabase-js invoca las RPC por
   POST por defecto → sin impacto.

## Contexto del repo (hallazgos de planificación)
- **PostgREST**: soporta resource embedding sobre resultados de funciones que
  devuelven `setof <tabla>` → buscarSeries puede encadenar
  `.rpc('buscar_series', { q }).select(SERIE_SELECT)` y reutilizar
  toSerieCard. Si el typing con los tipos generados no inferiera los embeds,
  fallback: segundo paso `.from('serie').select(SERIE_SELECT).in('id', ids)`
  (patrón getSerieIdsByCanal, lib/series.ts). Si el fallback dispara, se
  ajusta la firma en el mismo archivo de migración antes del commit de
  cierre (la migración no se committea hasta entonces).
- **types/database.ts**: generado; `npm run gen:types` ya existe en
  package.json. Functions hoy solo contiene is_admin_or_mod; tras la
  migración + regeneración aparecen buscar_series/buscar_canales con
  Args/Returns tipados.
- **RLS**: lectura pública de serie/canal/participa (policies using(true)).
  Las funciones son SECURITY INVOKER: las queries internas corren como anon
  bajo las mismas policies → misma postura de seguridad que la lectura
  directa. "Solo aprobadas" se aplica dentro del SQL de la función (defensa
  en profundidad; mismo resultado que el filtro en lib/ de F003/F004/F005).
- **unaccent**: se crea `with schema extensions` (convención Supabase) y se
  invoca cualificado (`extensions.unaccent`) para no depender del
  search_path del rol.
- **Next 16**: searchParams es Promise en page y generateMetadata (patrón
  app/series/page.tsx). force-dynamic: los datos cambian sin rebuild.
- **Tests**: vitest con fileParallelism:false; cada archivo hace wipe+seed
  propio (patrón tests/lib/canales.test.ts) → tests/lib/busqueda.test.ts usa
  seed propio bs-* sin interferencias.
- **E2E**: el fixture global ya da material de búsqueda ('Canal Dos'
  participa en e2e-01 y e2e-09, ambas aprobadas); no hace falta tocar
  global-setup. La insensibilidad a acentos se cubre en los tests de
  servidor (el fixture E2E no tiene títulos acentuados); el E2E cubre
  mayúsculas y el flujo completo.

## Orden de tareas (una sesión de Build por tarea)

### T0 — Specs
- spec/features/006-busqueda/spec.md (texto aprobado, verbatim) · plan.md
  (este archivo) · tasks.md. Sin código.

### T1 — Migración (unaccent + RPC) + tipos
- supabase/migrations/<ts>_enable_unaccent_search.sql:
  - `create extension if not exists unaccent with schema extensions;`
  - `public.buscar_series(q text) returns setof public.serie`: series
    aprobadas donde `unaccent(titulo) ilike patron` O existe participa→canal
    con `unaccent(nombre)/unaccent(handle) ilike patron`.
  - `public.buscar_canales(q text) returns setof public.canal`: canales con
    ≥1 serie aprobada (exists participa→serie aprobada) y nombre/handle
    coincidente; `order by nombre`.
  - Patrón con escape de comodines en ambas; `language sql stable`,
    `set search_path = public, extensions`.
- `supabase db reset` + `npm run gen:types`.
- Verificación: db reset verde; types/database.ts incluye ambas funciones;
  smoke por psql (`select * from buscar_series('…')`).

### T2 — lib/busqueda.ts + tests de servidor
- lib/series.ts: exportar SERIE_SELECT, toSerieCard y byWrDesc (sin cambios
  de lógica; precedente toRating de F005).
- lib/busqueda.ts (nuevo):
  - `buscarSeries(q)`: trim; vacío → [] sin consultar;
    `Promise.all([unwrap(rpc('buscar_series', { q }).select(SERIE_SELECT)), getGlobalMeanRating()])`
    → sort byWrDesc(c) → map toSerieCard.
  - `buscarCanales(q)`: trim; vacío → []; unwrap(rpc('buscar_canales', { q }))
    → map a CanalResultado { id, nombre, handle, avatar_url } (el orden
    nombre asc viene del SQL).
- tests/lib/busqueda.test.ts (nuevo, seed propio bs-*/@iswdb-bs-*):
  - Fixture: categoría 'Busqueda' · canales 'Canal BS Uno' @iswdb-bs-uno
    (avatar; participa en bs-01 y bs-02), 'Canal BS Dos' @iswdb-bs-dos (solo
    en la pendiente bs-03), 'Canal BS Tres' @iswdb-bs-tres (sin
    participaciones), 'Café Canal' @iswdb-bs-cafe (participa en bs-02) ·
    series bs-01 'Marbella Vice' aprobada, bs-02 'Café Táctico' aprobada,
    bs-03 'Marbella Oculta' pendiente.
  - buscarSeries: 'marbella' → solo bs-01 (bs-03 excluida aunque el título
    coincide) · 'MARBELLA' → idem (mayúsculas) · 'cafe tactico' → bs-02
    (término sin acentos) · 'café' → bs-02 · por nombre de canal
    ('Canal BS Uno') → bs-01 + bs-02 · por handle ('iswdb-bs-uno') →
    bs-01 + bs-02 · 'iswdb-bs-dos' → [] (solo participa en pendiente) ·
    'zzzz' → [] · '%' y '_' → [] (escape de comodines) · término blank → [].
  - buscarCanales: 'canal bs uno' → Canal BS Uno · 'iswdb-bs-uno' → ídem ·
    'cafe canal' → Café Canal (acento en el nombre) · 'Canal BS Dos' → []
    (sin series aprobadas) · 'Canal BS Tres' → [] · 'zzz' → [].
- Verificación: `npm test -- --run` verde (suite completa, BD local arriba).

### T3 — Ruta /buscar + barra del header
- app/buscar/page.tsx (nuevo, RSC): force-dynamic · searchParams Promise ·
  generateMetadata: title `Búsqueda: <q>` (sin q → "Buscar"), description,
  canonical /buscar(?q=) + OG · sin q → h1 "Buscar" + EmptyState (icono
  Search) con el hint "Busca por título de serie o nombre de canal"
  (BUS-04) · con q → Promise.all(buscarSeries, buscarCanales) → h1
  `Búsqueda: <q>` + recuento · sección "Series" (h2): grid idéntico al de
  /series (grid-cols-2 sm:3 md:4 lg:6) con SerieCard (headingLevel 3) ·
  sección "Canales" (h2): filas con avatar (next/image circular o
  placeholder User) + nombre + handle visible con '@', enlace a
  /canales/<handleParaUrl> (D15) · solo secciones no vacías; ambas vacías →
  EmptyState (SearchX) "Sin resultados para '<q>'" + link "Ver todas las
  series" → /series (BUS-05).
- components/header.tsx: formulario GET `role="search"` action="/buscar"
  entre el nav y el bloque de cuenta; input type="search" name="q" con
  aria-label; botón submit con icono Search (texto sr-only); ancho
  responsive; cero JS cliente.
- Verificación: lint + typecheck + build verdes; smoke manual en dev con
  seed temporal.

### T4 — E2E Playwright
- e2e/busqueda.spec.ts (nuevo; sin cambios en el fixture global):
  - / → rellenar la barra del header con 'Canal Dos' → submit →
    /buscar?q=…: sección "Series" con las tarjetas de Serie e2e 1 y
    Serie e2e 9 + sección "Canales" con link Canal Dos → href
    /canales/canal-dos · click en la tarjeta → /series/e2e-01.
  - Mayúsculas: 'CANAL DOS' → mismos resultados.
  - /buscar sin q → hint visible.
  - /buscar?q=zzzzzz → "Sin resultados para 'zzzzzz'" + link a /series.
  - Metadata: <title> "Búsqueda: Canal Dos · ISWDB".
- Verificación: `npm run test:e2e` verde (catálogo, ficha, canal,
  valoraciones y auth sin regresiones).

### T5 — Lighthouse + cierre
- Lighthouse manual en /buscar?q=<término> (Perf ≥90, SEO 100, A11y ≥95;
  evidencia pegada).
- ./validate.sh completo en verde (evidencia pegada).
- Docs: ROADMAP.md (006 ✅) · docs/memory/session-log.md.
- Commit de cierre: `F6: …`.

## Archivos
**Crear**
- spec/features/006-busqueda/{spec.md,plan.md,tasks.md}
- supabase/migrations/<ts>_enable_unaccent_search.sql
- lib/busqueda.ts · app/buscar/page.tsx
- tests/lib/busqueda.test.ts · e2e/busqueda.spec.ts

**Modificar**
- lib/series.ts (export SERIE_SELECT, toSerieCard, byWrDesc)
- components/header.tsx (formulario de búsqueda)
- types/database.ts (regenerado vía gen:types)
- Al cierre: ROADMAP.md · docs/memory/session-log.md

## Riesgos técnicos
- **Typing de `.rpc().select()` con embeds**: PostgREST soporta embedding
  sobre resultados de funciones setof-tabla, pero el typing de supabase-js
  podría no inferir los embeds categoria/participa/valoracion sobre el
  resultado de la RPC. Los tests de T2 lo detectan de inmediato; fallback:
  segundo paso `.in('id', ids)` con el builder normal (patrón
  getSerieIdsByCanal). Si el fallback dispara, la firma de la función se
  ajusta en el mismo archivo de migración antes del commit de cierre.
- **Escape de comodines %/_/\**: sin escape, buscar "%" devolvería todo el
  catálogo. Se escapa dentro de la función (cadena de replaces, `\` primero)
  y hay tests dedicados ('%' y '_' → []).
- **unaccent y search_path**: la extensión vive en el schema extensions;
  dentro de las funciones se invoca cualificada (extensions.unaccent) y el
  search_path queda fijado a `public, extensions`.
- **RLS**: SECURITY INVOKER (por omisión) → las queries internas corren como
  anon bajo las policies de lectura pública; no se crea ni toca ninguna
  policy. El filtro de aprobadas vive en el SQL de la función.
- **STABLE vs IMMUTABLE**: unaccent es STABLE; las funciones se declaran
  STABLE y supabase-js las invoca por POST (PostgREST reserva GET para
  inmutables) → sin impacto.
- **Doble query metadata+página**: 2 round-trips por render, aceptado como
  en F004/F005 (catálogo pequeño).
- **Header en móvil**: el formulario usa ancho responsive (w-36 → sm:w-52);
  se verifica visualmente en T3 que no desplaza el nav existente.
- **Prerender en build**: force-dynamic + await searchParams; el build no
  toca la BD.

## Qué NO haré (fuera de alcance)
- Búsqueda en descripción o categoría · paginación de resultados ·
  full-text search con ranking tsvector · sugerencias/autocomplete ·
  historial de búsquedas.
- Prefill del término en la barra del header (requeriría JS cliente) ·
  noindex de /buscar · dependencias nuevas · tocar RLS · editar migraciones
  ya aplicadas.
