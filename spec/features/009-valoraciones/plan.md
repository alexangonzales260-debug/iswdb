# 009 — Valoraciones 1–10 + fórmula WR · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Fórmula WR estilo IMDb: WR = (v/(v+m))*R + (m/(v+m))*C con m=10 y
   C = media global de series aprobadas con ≥1 voto.
2. UI: selector 1–10 numérico en la ficha + cambiar (upsert) + eliminar (delete).
3. Histograma: sí, barras de notas 1–10 en la ficha.
4. WR solo en rankings (top 5, hero, /series, filmografía de canal);
   AVG + conteo en la ficha por transparencia.
5. Recálculo derivado en lectura, sin caché.

## Decisiones técnicas (justificadas)
1. **Interpretación de C** (⚠ confirmar en revisión): C = media aritmética de
   TODAS las notas de series aprobadas (cada valoración pesa igual; series con
   0 votos no aportan nada). Es la definición estándar de la fórmula IMDb
   ("mean vote across the whole report"), restringida a aprobadas. Se calcula
   al vuelo en cada lectura: un query `serie → valoracion(nota)` filtrado por
   moderation_status='aprobada', flatten de notas y media. Sin notas → C = 0
   (los rankings estarían vacíos igualmente: exigen ≥1 valoración).
2. **WR solo ordena; no se muestra** (VAL-06, CAT-06). `SerieCard.rating` y
   `SerieFicha.rating` siguen siendo { average, count } (AVG redondeado a 1
   decimal); tarjetas, ficha y filmografía no cambian lo que pintan, solo el
   orden. WR se calcula a partir de { count, average } ya presentes en cada
   fila (v = count, R = average sin redondear… ver nota en T1: se usa el AVG
   exacto de las notas, no el redondeado, para no introducir sesgo).
3. **/series ordena por WR** (VAL-05 dice literalmente "orden de /series"):
   con valoración primero (WR desc), sin valoración al final (entre sí por
   created_at desc), empates de WR por created_at desc. PostgREST no puede
   ordenar el padre por un agregado del hijo ni por un valor derivado, así que
   listSeries pasa a fetch-all + sort + slice en TS (mismo patrón y
   justificación que getTopSeries: "catálogo pequeño por diseño"). El
   head-count previo desaparece: total sale del array. Filtros categoria/canal
   se mantienen; C sigue siendo global (no por filtro).
4. **Filmografía de canal**: el comparador byFilmografia cambia
   `rating.average` por WR en el tercer criterio; sin valoración sigue
   valiendo 0 (últimas dentro de su grupo anio/estado, comportamiento
   actual). getCanalByHandle obtiene C una vez y lo pasa al comparador.
5. **VAL-07 server-side**: `serie_select_public` usa `using (true)` — anon
   puede LEER series pendientes/rechazadas, así que la guardia de estado NO
   puede depender de RLS. valorarSerie() consulta la serie por slug y rechaza
   si moderation_status !== 'aprobada' (error mapeado, constante
   ERRORES_VALORACION). eliminarValoracion() solo exige que la serie exista:
   si una serie deja de estar aprobada, el usuario puede retirar su voto.
   El requisito de rol ('user' o superior) lo cumple requireUser(): todo
   autenticado tiene rol ≥ user; no hay check extra.
6. **Servicios inyectables** (patrón F008): valorarSerie(client, userId,
   serieSlug, nota) y eliminarValoracion(client, userId, serieSlug) reciben el
   cliente Supabase por parámetro. Las actions pasan createAuthClient()
   (cookies); los tests pasan clientes de signInTestUser (persistSession:
   false) → RLS con auth.uid() real sin request context de Next.
7. **Upsert**: `upsert({ user_id, serie_id, nota }, { onConflict:
   'user_id,serie_id' })`. La tabla tiene UNIQUE(user_id, serie_id) (la PK es
   uuid id — el "PK user_id+serie_id" de la spec se refiere a esta unique).
   RLS: valoracion_insert_own + valoracion_update_own cubren ambos caminos del
   ON CONFLICT. created_at se preserva en cambio de nota (DO UPDATE solo toca
   nota); updated_at lo refresca el trigger existente.
8. **Server Actions de llamada directa** (no useActionState): el selector son
   10 botones + eliminar, no un form. accionValorar(serieSlug, nota) devuelve
   { error?: string }; el cliente lo pinta sin navegar. Sin sesión,
   requireUser({ next: '/series/<slug>', message: 'Debes iniciar sesión para
   valorar' }) redirige a /login (AUTH-06; redirect dentro de action llamada
   por startTransition navega al cliente — se verifica en E2E).
9. **Revalidación**: revalidatePath('/', 'layout') tras ambas mutaciones.
   Una valoración afecta a ficha, home (top 5/hero), /series (orden),
   filmografías y /perfil; enumerar rutas sería frágil. A escala de catálogo
   la invalidación global es asumible (follow-up junto a caché de WR si crece).
   VAL-01 "sin recargar": tras la action, Next refresca el payload RSC
   automáticamente → la ficha re-renderiza con agregados y notaActual nuevos
   desde el servidor (el selector no recalcula nada en cliente).
10. **getDistribucionNotas(serieId)** vive en lib/valoraciones.ts como
    servicio propio (testeable aislado, reutilizable en F012): devuelve las 10
    entradas { nota, count } (nota 1..10, incluyendo ceros) con el cliente
    anon (lectura pública, D11) contando en TS. La ficha hará 1 query extra
    (las notas ya vienen en el embed de la ficha, pero derivar ahí acoplaría
    el histograma al select de la ficha); query barata, catálogo pequeño.
11. **getValoracionUsuario(serieId, userId)**: cliente anon + .eq por ambos
    (mismo patrón que listMisValoraciones) → nota | null. Solo se llama con
    sesión.
12. **Componentes**: rating-histogram.tsx es RSC puro (barras 10→1, ancho ∝
    al máximo, con 0 votos muestra "Sin valoraciones todavía").
    rating-selector.tsx es "use client" (justificado: estado de transición y
    optimismo de selección): useTransition + llamada directa a las actions,
    error de la action visible, nota actual resaltada, botón "Eliminar
    valoración" solo si tiene nota. Sin sesión: texto "Inicia sesión para
    valorar" como link a /login?next=/series/<slug>&msg=Debes iniciar sesión
    para valorar (banner de F008, AUTH-06).
13. **Sin migraciones ni types/database.ts**: esquema y RLS de valoracion ya
    existen (F002 M2/M3). Sin dependencias nuevas.
14. **ADR**: el principio "derivados sin caché" (WR, C, histograma al vuelo)
    no está recogido en DECISIONS.md — el D13 real es sobre thumbnails de
    episodios. Al cierre se añade D16 con esta decisión.

## Contexto del repo (hallazgos de planificación)
- **valoracion** (20260826161459): id uuid PK, user_id → usuario (cascade),
  serie_id → serie (cascade), nota check 1–10, unique(user_id, serie_id),
  trigger updated_at. RLS (20260826162336): select público (anon incluido),
  insert/update/delete solo fila propia (user_id = auth.uid()).
- **serie_select_public = using (true)**: las series pendientes son legibles
  por anon → el rechazo de VAL-07 es necesariamente app-side (decisión 5).
- **Pedidos de tests existentes bajo WR** (C calculado con el seed propio de
  cada archivo; vitest fileParallelism=false, cada archivo hace wipe+seed):
  - tests/lib/series.test.ts (ql-*): C = 85/10 = 8.5. Top 5 y hero NO
    cambian de orden (ql-10, ql-04, ql-13, ql-07, ql-02; hero ql-10) ni los
    rating visibles ({ average: 9.7, count: 3 } etc.). SÍ cambia listSeries:
    página 1 = [ql-10, ql-04, ql-13, ql-07, ql-02, ql-11, ql-15, ql-14,
    ql-12, ql-09, ql-08, ql-06] · página 2 = [ql-05, ql-03, ql-01] ·
    categoria=minecraft → [ql-04, ql-02, ql-06, ql-05, ql-03, ql-01] ·
    canal=@iswdb-uno → [ql-13, ql-02, ql-08, ql-05] · combinado →
    [ql-02, ql-05] · page=0 → primera es ql-10. Totales (15, 2 páginas) igual.
  - tests/lib/canales.test.ts (fc-*): C = 9.0 → WR fc-04 9.09 > fc-01 9.0 >
    fc-03 8.91; pero el orden CAN-01 manda anio/estado antes que rating →
    [fc-03, fc-02, fc-04, fc-01, fc-05] NO cambia.
  - E2E (global-setup): C = 8.0 → WR e2e-10 8.25 > e2e-04 8.0 > e2e-13 7.75:
    hero sigue siendo e2e-10; /series página 2 sigue teniendo a e2e-01
    (3 con valoración + 9 sin valoración en página 1); filmografía de
    @canal-uno sigue [e2e-02, e2e-13, e2e-09, e2e-05]. Ningún spec E2E
    existente debería romperse (se verifica en T5).
- **Caso divergente AVG≠WR** para el test nuevo: con m=10 y C bajo, una serie
  con AVG 9 y 2 votos supera en WR a una de AVG 10 con 1 voto. Fixture wr-*
  propuesto (9 auth users): wr-a [10] · wr-b [9,9] · wr-d [5×6] → C = 58/9 ≈
  6.44 → WR wr-b ≈ 6.87 > wr-a ≈ 6.77 > wr-d ≈ 5.90; wr-c sin notas → última.
  El orden AVG sería wr-a > wr-b > wr-d: demuestra que ordena WR.
- **E2E**: workers=1, archivos en orden alfabético → valoraciones.spec.ts
  corre el último; su cleanup (deleteAuthUser → cascade) restaura el fixture.
  Ojo: el usuario E2E necesita fila en public.usuario (FK de valoracion) →
  helper nuevo en global-setup (createAuthUser solo crea el auth user; la fila
  de usuario la inserta el seed o el self-healing de /perfil, que el flujo de
  valorar no visita).
- **Ficha actual** (app/series/[slug]/page.tsx): force-dynamic, rating en
  cabecera con ratingTexto (AVG + conteo) — se conserva; se añade sección
  "Valoraciones". getUser() ya está cacheado (el header lo llama en el mismo
  request).
- **GoTrue local**: usuarios de test vía createTestUser/signInTestUser
  (tests/db/env.ts) y createAuthUser (e2e/global-setup.ts), con retry en frío.

## Orden de tareas (una sesión de Build por tarea)

### T1 — Fórmula WR + ordenaciones en lib/series.ts + tests
- lib/series.ts:
  - `WR_M = 10` · `weightedRating(v, r, c, m = WR_M)` función pura (v=0 → c
    por fórmula; solo se llamará con v≥1).
  - `getGlobalMeanRating()`: media de todas las notas de series aprobadas
    (query serie→valoracion(nota) con eq moderation_status; sin notas → 0).
  - byRatingDesc → compara WR (getTopSeries/getHeroSerie obtienen C antes y
    cierran el comparador sobre él); empates por created_at desc.
  - listSeries → fetch de todas las series filtradas + sort WR (con
    valoración desc; sin valoración al final por created_at desc) + slice de
    página en TS; sin head-count.
  - toRating: para el comparador se necesita R sin redondear → o bien
    `toRatingExact` interno o guardar sum/count; el rating visible sigue
    redondeado a 1 decimal.
  - Actualizar comentarios que dicen "la fórmula WR llega en F009"
    (lib/series.ts, lib/format.ts).
- tests/lib/wr.test.ts (nuevo, fixture wr-* propio, 9 auth users):
  - weightedRating pura: valores exactos con m=10; v=0 → c; m custom.
  - C global exacto del fixture (58/9).
  - getTopSeries/getHeroSerie ordenan por WR ≠ orden AVG (wr-b antes que
    wr-a); sin valoración fuera del top; hero = wr-b.
  - listSeries: con valoración por WR desc, sin valoración al final.
- tests/lib/series.test.ts: actualizar expectativas de listSeries al orden WR
  (listadas arriba en Contexto); top 5/hero conservan orden pero los textos
  de los tests pasan a hablar de WR; añadir aserción de que el orden es WR
  (p. ej. nota sobre C esperado).
- Verificación: `npm test -- --run` verde (BD local arriba).

### T2 — Filmografía de canal a WR + tests
- lib/canales.ts: getCanalByHandle obtiene C (getGlobalMeanRating) y
  byFilmografia compara WR en el tercer criterio (sin valoración → 0).
- tests/lib/canales.test.ts: el orden esperado no cambia (verificado arriba);
  actualizar comentarios del comparador y añadir cobertura explícita de que el
  tercer criterio es WR (p. ej. caso con anio/estado empatados donde WR
  difiere del AVG).
- Verificación: `npm test -- --run` verde.

### T3 — Servicios de lectura/escritura de valoraciones + tests
- lib/valoraciones.ts (extiende el existente):
  - getDistribucionNotas(serieId) → { nota, count }[10] (1..10, con ceros).
  - getValoracionUsuario(serieId, userId) → number | null.
  - valorarSerie(client, userId, serieSlug, nota): valida serie por slug →
    inexistente o moderation_status !== 'aprobada' → throw ERRORES_VALORACION
    (VAL-07) → upsert onConflict 'user_id,serie_id'.
  - eliminarValoracion(client, userId, serieSlug): serie debe existir; delete
    por serie_id + user_id.
  - ERRORES_VALORACION = { serieNoAprobada, serieNoEncontrada } (textos UI es).
- tests/lib/valoraciones.test.ts (extender; añadir 1 serie pendiente al
  fixture vl-*): distribución con notas y ceros · getValoracionUsuario
  propia/ajena/inexistente · valorarSerie crea (cliente de signInTestUser,
  RLS auth.uid()) · cambio de nota es upsert (misma fila, created_at
  preservado) · eliminarValoracion borra · valorar pendiente → rechazo ·
  valorar slug inexistente → rechazo.
- Verificación: `npm test -- --run` verde.

### T4 — Server Actions + componentes + integración en ficha
- lib/valoraciones-actions.ts (nuevo, "use server"):
  - accionValorar(serieSlug, nota): Zod (slug string mín 1, nota
    z.number().int().min(1).max(10)) → requireUser({ next, message }) →
    createAuthClient() → valorarSerie → revalidatePath('/', 'layout') →
    { error? } en fallo.
  - accionEliminarValoracion(serieSlug): requireUser → eliminarValoracion →
    revalidatePath('/', 'layout').
- components/rating-histogram.tsx (nuevo, RSC): barras 10→1 con conteo,
  ancho proporcional al máximo; 0 votos → "Sin valoraciones todavía".
- components/rating-selector.tsx (nuevo, "use client"): props { serieSlug,
  notaActual, haySesion }. Sin sesión → link AUTH-06. Con sesión → botones
  1–10 (nota actual resaltada), useTransition, error de action visible,
  botón eliminar si hay notaActual.
- app/series/[slug]/page.tsx: sección "Valoraciones" con <RatingHistogram>
  (getDistribucionNotas) y <RatingSelector> (getUser + getValoracionUsuario).
  La cabecera conserva AVG + conteo (VAL-06).
- Verificación: lint + typecheck + build verdes; smoke manual en dev
  (valorar/cambiar/eliminar con sesión; link AUTH-06 sin sesión).

### T5 — E2E Playwright
- e2e/global-setup.ts: helper createAuthUserWithUsuario(email) = createAuthUser
  + insert de la fila public.usuario (FK necesaria para valorar).
- e2e/valoraciones.spec.ts (nuevo; usuario único por ejecución, cleanup
  afterAll vía deleteAuthUser → cascade):
  1. Anónimo en ficha → "Inicia sesión para valorar" → click → /login con
     next y msg → login → vuelta a la ficha → valorar 8 → AVG + conteo
     actualizados (1 valoración) + barra del 8 en histograma + "Tu
     valoración" marcada → cambiar a 5 → agregado actualizado → eliminar →
     agregado vuelve a "Sin valoraciones" y el selector queda sin nota.
  2. El rechazo de serie no aprobada NO es testeable por UI (la ficha de
     pendiente es 404); queda cubierto a nivel de servicio en T3 (el server
     action llama a valorarSerie sin saltarse el check).
- Verificación: `npm run test:e2e` verde; auth/canal/catalogo/ficha sin
  regresiones (órdenes verificados estables en Contexto).

### T6 — validate.sh + cierre
- ./validate.sh completo (salida real pegada).
- ROADMAP.md: 009 ✅.
- DECISIONS.md: D16 "Derivados sin caché" (WR, C, histograma al vuelo;
  D13 era thumbnails — aclarar referencia).
- docs/memory/session-log.md: sesión F009.
- Commit atómico `F9: …` + tag, tras tu revisión del diff (DoD #4).

## Archivos
**Crear**
- spec/features/009-valoraciones/{spec.md,plan.md,tasks.md}
- lib/valoraciones-actions.ts
- components/rating-selector.tsx · components/rating-histogram.tsx
- tests/lib/wr.test.ts · e2e/valoraciones.spec.ts

**Modificar**
- lib/series.ts (WR, C, byRatingDesc, listSeries) · lib/canales.ts (WR en
  filmografía) · lib/valoraciones.ts (nuevos servicios) · lib/format.ts
  (comentario)
- app/series/[slug]/page.tsx (sección Valoraciones)
- tests/lib/series.test.ts · tests/lib/canales.test.ts ·
  tests/lib/valoraciones.test.ts
- e2e/global-setup.ts (helper de usuario con fila public.usuario)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md

## Riesgos técnicos
- **Revalidación global**: revalidatePath('/', 'layout') invalida todo el
  sitio tras cada valoración; correcto y simple a escala de catálogo, pero es
  la primera palanca a tocar (junto a caché de WR) si el tráfico crece.
- **RLS con auth.uid() en upsert**: el ON CONFLICT DO UPDATE necesita que la
  política de update también pase (user_id = auth.uid()) — existe
  (valoracion_update_own). La FK user_id→usuario exige fila en public.usuario:
  en producción la crea el registro (registrarUsuario) o el self-healing de
  /perfil; en tests/E2E se inserta explícitamente.
- **Tests F003**: listSeries cambia de orden (created_at → WR); hay que
  reescribir expectativas de 6 tests de listSeries en series.test.ts. Top 5 y
  hero conservan orden con el fixture actual (verificado numéricamente) — la
  prueba real de WR va en wr.test.ts con fixture divergente.
- **C depende del estado de la BD**: cada archivo de tests hace wipe+seed y
  vitest serializa archivos, así C es determinista por archivo; wr.test.ts
  debe calcular C sobre SU fixture (no hardcodear 85/11 de otros archivos).
- **Redirect dentro de action llamada por startTransition** (AUTH-06 sin
  sesión): Next debe navegar a /login; si no se comportara, fallback:
  devolver { error: 'no-session' } y navegar con router.push. Se verifica en
  el E2E de T5.
- **AVG exacto vs redondeado en WR**: usar el AVG redondeado a 1 decimal como
  R introduciría error; el comparador usa la media exacta (decisión 2).
- **Orden alfabético E2E**: valoraciones.spec.ts muta agregados del fixture;
  corre el último y su cleanup restaura, pero si se añade un spec
  alfabéticamente posterior que dependa de agregados, revisar.

## Qué NO haré (fuera de alcance)
- Reseñas con texto (F012) · opción de usuario para ordenar /series ·
  caché/materialización de WR o C · edición de valoraciones seed.
- Migraciones, cambios en types/database.ts, dependencias nuevas.
- Mostrar WR en la UI (solo AVG + conteo, VAL-06).
- Tocar /login, /registro, /perfil ni el header (F008 cerrado); /perfil se
  beneficia de la revalidación sin cambios.
- Moderación de series (F011) ni gestión de roles (F010).
