# 009 — Valoraciones 1–10 + fórmula WR · Tareas

- [x] T1 — Fórmula WR + queries de series
  lib/series.ts: WR_M = 10 · weightedRating(v, r, c, m) función pura ·
  getGlobalMeanRating() (C = media de todas las notas de series aprobadas;
  sin notas → 0; pendientes excluidas) · getTopSeries/getHeroSerie ordenan
  por WR (mínimo 1 valoración, empate → created_at desc) · listSeries pasa a
  fetch-all + orden WR en TS (con valoración desc; sin valoración al final
  por created_at desc) + slice de página en TS; sin head-count. Comentarios
  "la fórmula WR llega en F009" actualizados (lib/series.ts, lib/format.ts).
  tests/lib/wr.test.ts (nuevo, fixture wr-* propio: 9 auth users, 4 aprobadas
  + 1 pendiente con nota alta): fórmula pura (m=10, R=C → WR=R, v=0 → C,
  m custom) · BD vacía (C → 0, top → []) · C global exacto 58/9 (la
  pendiente excluida) · top/hero en orden WR ≠ orden AVG (wr-b antes que
  wr-a) · sin valoración fuera del top · listSeries con sin-valoración al
  final.
  tests/lib/series.test.ts: expectativas de listSeries reescritas al orden
  WR (página 1 con valoradas primero, página 2, filtros categoria/canal/
  combinado, página inválida) · top 5/hero pasan a criterio WR (el orden
  con el fixture ql-* no cambia, verificado numéricamente).
  Criterio: npm test -- --run verde (BD local arriba).

- [x] T2 — Filmografía de canal a WR
  lib/canales.ts: getCanalByHandle obtiene C (getGlobalMeanRating) y
  byFilmografia compara WR en el tercer criterio (sin valoración → 0,
  último dentro de su grupo anio/estado).
  tests/lib/canales.test.ts: el orden CAN-01 no cambia con el fixture
  (verificado: C = 9.0); actualizar comentarios del comparador y añadir
  cobertura explícita del tercer criterio como WR.
  Criterio: npm test -- --run verde.

- [x] T3 — Servicios de valoraciones (lectura + escritura)
  lib/valoraciones.ts (extender): getDistribucionNotas(serieId) → 10
  entradas { nota, count } con ceros · getValoracionUsuario(serieId, userId)
  → nota | null · valorarSerie(client, userId, serieSlug, nota): serie
  inexistente o moderation_status !== 'aprobada' → throw ERRORES_VALORACION
  (VAL-07) → upsert onConflict 'user_id,serie_id' · eliminarValoracion(
  client, userId, serieSlug): la serie debe existir; delete por serie_id +
  user_id.
  tests/lib/valoraciones.test.ts (extender; añadir serie pendiente al
  fixture vl-*): distribución con notas y ceros · getValoracionUsuario
  propia/ajena/inexistente · valorar crea fila (cliente signInTestUser, RLS
  auth.uid()) · cambio de nota = upsert (misma fila, created_at preservado)
  · eliminar borra · pendiente → rechazo · slug inexistente → rechazo.
  Criterio: npm test -- --run verde.

- [x] T4 — Server Actions + componentes + ficha
  lib/valoraciones-actions.ts (nuevo, "use server"): accionValorar(
  serieSlug, nota) con Zod (nota int 1–10) + requireUser({ next, message })
  (AUTH-06) + valorarSerie + revalidatePath('/', 'layout') · accionEliminar
  Valoracion(serieSlug) análogo. En fallo devuelven { error }.
  components/rating-histogram.tsx (nuevo, RSC): barras 10→1 con conteo,
  ancho ∝ máximo; 0 votos → "Sin valoraciones todavía".
  components/rating-selector.tsx (nuevo, "use client"): botones 1–10, nota
  actual resaltada, useTransition + llamada directa a las actions, error
  visible, botón eliminar con notaActual; sin sesión → "Inicia sesión para
  valorar" → /login?next=/series/<slug>&msg=… (AUTH-06).
  app/series/[slug]/page.tsx: sección "Valoraciones" con histograma
  (getDistribucionNotas) + selector (getUser + getValoracionUsuario); la
  cabecera conserva AVG + conteo (VAL-06).
  Criterio: lint + typecheck + build verdes; smoke manual en dev (valorar →
  cambiar → eliminar sin recargar; link AUTH-06 sin sesión).

- [x] T5 — E2E Playwright
  e2e/global-setup.ts: helper createAuthUserWithUsuario(email) =
  createAuthUser + insert de la fila public.usuario (FK de valoracion).
  e2e/valoraciones.spec.ts (nuevo; usuario único por ejecución, cleanup
  deleteAuthUser → cascade): anónimo → "Inicia sesión para valorar" →
  /login con next y msg → login → vuelta a la ficha → valorar 8 → AVG +
  conteo e histograma actualizados → cambiar a 5 → eliminar → agregado vuelve
  a "Sin valoraciones". El rechazo de no aprobada queda cubierto a nivel de
  servicio (T3): la ficha de pendiente es 404.
  Criterio: npm run test:e2e verde; auth/canal/catalogo/ficha sin
  regresiones.

- [x] T6 — validate.sh + cierre
  ./validate.sh completo (salida pegada) · ROADMAP.md (009 ✅) ·
  DECISIONS.md (D16 "Derivados sin caché": WR, C e histograma al vuelo;
  aclarar que D13 es thumbnails) · docs/memory/session-log.md (sesión F009)
  · commit atómico `F9: …` + tag tras revisión del diff (DoD #4).
  Criterio: Definition of Done completa.
