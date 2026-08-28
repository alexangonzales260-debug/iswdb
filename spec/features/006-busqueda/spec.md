# 006 — Búsqueda

## Contexto
Feature L2. Permite a visitantes buscar el catálogo por título de serie y
nombre de canal. No requiere login. Usa Postgres ILIKE + unaccent para
búsqueda insensible a acentos y mayúsculas. Reutiliza SerieCard de F003 y
links de canal de F005.

## Ruta
- `/buscar?q=<termino>`: resultados de búsqueda (series + canales).

## Requisitos (EARS)
- BUS-01: Cuando un visitante envía un término de búsqueda, el sistema deberá
  mostrar las series cuyo título coincida (ILIKE + unaccent) y los canales
  cuyo nombre o handle coincida, en dos secciones ("Series" y "Canales").
- BUS-02: Cuando se renderizan series en resultados, se usará el componente
  SerieCard existente; los canales se mostrarán con avatar + handle y enlace
  a /canales/<handle>.
- BUS-03: La búsqueda será insensible a mayúsculas y acentos ("marbella"
  encuentra "Marbella Vice").
- BUS-04: Cuando no hay query (/buscar), el sistema mostrará el hint
  "Busca por título de serie o nombre de canal".
- BUS-05: Cuando no hay resultados, el sistema mostrará EmptyState
  "Sin resultados para '<q>'" con link a /series.
- BUS-06: El header global tendrá una barra de búsqueda que navega a
  /buscar?q=<termino> (formulario GET, sin JS cliente).
- BUS-07: Solo series aprobadas aparecerán en resultados; los canales solo
  aparecerán si participan en ≥1 serie aprobada (coherente con F005).
- BUS-08: La página tendrá metadata SEO dinámica: title "Búsqueda: <q> · ISWDB".

## Criterios de aceptación
- [ ] GET /buscar?q=marbella muestra la serie Marbella Vice.
- [ ] Búsqueda insensible a acentos y mayúsculas.
- [ ] Búsqueda de canal por nombre/handle muestra el canal con enlace.
- [ ] Búsqueda por nombre de canal muestra las series de ese canal.
- [ ] /buscar sin q muestra el hint.
- [ ] /buscar?q=<sin resultados> muestra EmptyState con link a /series.
- [ ] Barra de búsqueda del header navega a /buscar?q=<termino>.
- [ ] Series no aprobadas no aparecen en resultados.
- [ ] Metadata dinámica presente.
- [ ] Lighthouse manual en /buscar?q=<termino>: Performance ≥90, SEO 100,
      Accessibility ≥95.
- [ ] ./validate.sh en verde.
- [ ] Tests de servidor: búsqueda por título, por canal, sin acentos,
      sin resultados, exclusión de no aprobadas.
- [ ] Test E2E Playwright: barra del header → resultados → click en serie.

## Fuera de alcance
- Búsqueda en descripción o categoría
- Paginación de resultados
- Full-text search con ranking de relevancia (tsvector)
- Sugerencias/autocomplete de búsqueda
- Historial de búsquedas
