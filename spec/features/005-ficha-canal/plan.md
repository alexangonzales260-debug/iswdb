# 005 — Ficha de canal · Plan técnico

## Decisiones adoptadas (aprobadas)
1. **CastList enlaza a /canales/<handle>**: el criterio E2E de F005 ("click en
   canal del reparto → ficha del canal") requiere cambiar el destino del link
   del reparto, que en F004 (FIC-05) apuntaba a /series?canal=<handle>. Se
   actualiza components/cast-list.tsx y el test e2e/ficha.spec.ts:92. El texto
   de la spec de F004 NO se edita (las specs no se cambian sin aprobación);
   el cambio queda documentado aquí y en session-log. El filtro
   /series?canal=<handle> de F003 sigue existiendo y funcional.
2. **Description SEO**: "<nombre> en ISWDB: X series como <rol-principal>."
   donde <rol-principal> es el rol de MAYOR JERARQUÍA presente en la
   filmografía aprobada (principal > colaborador > invitado), con etiqueta
   capitalizada. Singularización: "1 serie" vs "N series".
3. **Orden de la filmografía (CAN-01)**: anio_inicio desc (null al final) →
   estado: activa antes que finalizada → valoración media desc (null → 0) →
   created_at desc como desempate final determinista (patrón de lib/series.ts).
   Nota: "estado desc (activas antes que finalizadas)" se interpreta según el
   paréntesis de la spec: activas primero.
4. **404 (CAN-03)**: notFound() de Next.js, decidido ANTES de emitir el shell
   (hallazgo T3 de F004): query previa al render, sin Suspense en esta ruta.
5. **Query única**: canal + participa(rol, serie!inner(...)) filtrando
   participa.serie.moderation_status=eq.aprobada. El filtro de embed elimina
   filas de participa (no la fila del canal); canal con participa vacía → null.

## Contexto del repo (hallazgos de planificación)
- **Modelo F002**: canal(nombre, handle UNIQUE, avatar_url) · participa PK
  (serie_id, canal_id) con rol check ('principal','colaborador','invitado')
  default 'colaborador'. Sin migraciones nuevas.
- **RLS**: lectura pública de canal/participa/serie (serie_select_public
  using(true)); el filtro "solo aprobadas" vive en lib/ (igual que F003/F004).
- **SerieCard** (lib/series.ts): tipo reutilizado por components/serie-card.tsx;
  no incluye `estado`, necesario para ordenar → se extiende localmente
  (SerieFilmografia extends SerieCard { estado }).
- **toRating** es privado en lib/series.ts → se exporta para reutilizarlo.
- **ETIQUETAS_ROL** vive en components/cast-list.tsx → se muda a lib/format.ts
  como etiquetaRol(rol) (compartido por cast-list, ficha de canal y metadata).
- **Metadata**: layout con template "%s · ISWDB"; generateMetadata devuelve
  title: nombre. Doble query metadata+página aceptada (patrón F004).
- **next/image**: remotePatterns para img.youtube.com/i.ytimg.com ya existe.
- **Tests de BD**: vitest fileParallelism:false; cada archivo hace wipe+seed
  propio en beforeAll y cleanup en afterAll → tests/lib/canales.test.ts puede
  usar su propio seed fc-* sin interferir con series.test.ts.
- **Handles con '@'** en la URL: Next.js lo entrega crudo en params; Playwright
  navega /canales/@canal-dos sin codificar.
- **Next 16**: params es Promise<{ handle }> en page y generateMetadata.

## Orden de tareas (una sesión de Build por tarea)

### T1 — Query getCanalByHandle + tests de servidor
- lib/series.ts: exportar toRating (sin cambios de lógica).
- lib/format.ts: etiquetaRol(rol) (mudado de cast-list.tsx).
- components/cast-list.tsx: importa etiquetaRol desde lib/format (el cambio de
  link a /canales/<handle> se hace en T2, cuando la ruta exista).
- lib/canales.ts (nuevo):
  - Tipos: SerieFilmografia extends SerieCard { estado } ·
    FilmografiaSerie { serie, rol } · CanalFichaData { nombre, handle,
    avatar_url, series }.
  - CANAL_FICHA_SELECT: nombre, handle, avatar_url, participa ( rol,
    serie!inner ( id, titulo, slug, portada_url, anio_inicio, created_at,
    estado, categoria(nombre,slug), participa(canal(nombre,handle)),
    valoracion(nota) ) ).
  - getCanalByHandle(handle): .eq('handle', handle)
    .eq('participa.serie.moderation_status','aprobada').maybeSingle() →
    null si no hay fila o participa queda vacío. Mapper a SerieFilmografia
    reutilizando toRating; orden byFilmografia en TS.
  - rolDestacado(series): jerarquía principal > colaborador > invitado.
- tests/lib/canales.test.ts (nuevo, seed propio):
  - 1 categoría 'ficha-canal' · 4 canales @iswdb-fc-uno (con avatar),
    -dos, -tres, -cuatro · series fc-01..fc-05 aprobadas con anio/estado
    variados + fc-06 pendiente · 2 auth users para valoraciones.
  - Participaciones: fc-uno → fc-01 (principal), fc-02 (colaborador),
    fc-03 (invitado), fc-04 (colaborador), fc-05 (invitado) · fc-dos → solo
    fc-06 (pendiente) · fc-tres → ninguna · fc-cuatro → fc-03 (verifica que
    la tarjeta conserva todos los canales).
  - Valoraciones: fc-01 {9,2} · fc-03 {8,1} · fc-04 {10,1} · fc-02/fc-05 sin
    notas · fc-06 con nota (debe quedar excluida por pendiente).
  - Orden esperado fc-uno: [fc-03, fc-02, fc-04, fc-01, fc-05]
    (2024 activas por rating → 2024 finalizada → 2023 → null).
  - Casos: ficha completa de @iswdb-fc-uno (campos, orden, rol por serie,
    rating, categoria, canales de fc-03) · @iswdb-fc-dos → null ·
    @iswdb-fc-tres → null · @no-existe → null · rolDestacado.
- Verificación: npm test -- --run (suite completa, BD local arriba).

### T2 — Ruta /canales/[handle] + UI
- app/canales/[handle]/page.tsx (nuevo, RSC):
  - export const dynamic = 'force-dynamic' (CAN-04, patrón F004).
  - generateMetadata: await params → getCanalByHandle → notFound() si null
    (defensa; el 404 efectivo es el de la página) · title: nombre (template
    del layout añade " · ISWDB") · description: "<nombre> en ISWDB: N
    serie(s) como <EtiquetaRol>." con rolDestacado · alternates.canonical
    /canales/<handle> · openGraph.images solo si avatar_url existe.
  - Page: await params → getCanalByHandle → notFound() si null (antes del
    shell) · cabecera: avatar circular next/image priority o placeholder
    (icono User), h1 nombre, handle, conteo "N series aprobadas"
    singularizado · sección "Filmografía" (h2) con grid idéntico a /series
    (grid-cols-2 sm:3 md:4 lg:6): cada item = Badge con etiqueta de rol
    sobre la portada (absolute, pointer-events-none) + <SerieCard>.
- components/cast-list.tsx: Link href → /canales/<handle>.
- Verificación: lint + typecheck + build verdes; smoke manual con seed temporal.

### T3 — E2E Playwright
- e2e/global-setup.ts (aditivo; F003/F004 deben seguir verdes):
  - avatar_url en '@canal-dos' (img.youtube.com).
  - FIXTURE.roles: '@canal-uno' principal en e2e-09; resto default colaborador.
  - Canal nuevo '@canal-tres' participando SOLO en e2e-16 (pendiente) → 404.
  - e2e-02 con anio_inicio 2025 (hace observable el orden en E2E; ningún test
    existente afirma sobre su año).
- e2e/canal.spec.ts (nuevo):
  - /series?page=2 → click tarjeta e2e-01 → ficha → click en Canal Dos del
    reparto → /canales/@canal-dos renderiza (h1, conteo "2 series").
  - /canales/@canal-uno: orden filmografía [e2e-02, e2e-13, e2e-09, e2e-05]
    (2025 → rating 6.5 → empate sin rating por created_at desc) + badge
    "Principal" visible.
  - Metadata: <title> "Canal Uno · ISWDB", meta description "Canal Uno en
    ISWDB: 4 series como Principal.", og:image presente en @canal-dos.
  - /canales/@canal-tres (solo pendiente) y /canales/@no-existe → 404 con
    "Página no encontrada".
- e2e/ficha.spec.ts: assert de href del reparto → '/canales/@canal-dos'.
- Verificación: npm run test:e2e verde (catálogo + ficha sin regresiones).

### T4 — Lighthouse + cierre
- Seed temporal con avatar real → Lighthouse manual en /canales/<handle>
  (Perf ≥90, SEO 100, A11y ≥95; evidencia pegada) → borrar seed.
- ./validate.sh completo en verde (evidencia pegada).
- Docs: ROADMAP.md (005 ✅) · docs/memory/session-log.md (incluye el cambio
  del link del reparto respecto a FIC-05).
- Commit de cierre: `F5: …`.

## Archivos
**Crear**
- spec/features/005-ficha-canal/{spec.md,plan.md,tasks.md}
- lib/canales.ts · app/canales/[handle]/page.tsx
- tests/lib/canales.test.ts · e2e/canal.spec.ts

**Modificar**
- lib/series.ts (export toRating)
- lib/format.ts (etiquetaRol)
- components/cast-list.tsx (etiquetaRol de lib/format; en T2, link a /canales)
- e2e/global-setup.ts (fixture aditivo) · e2e/ficha.spec.ts (href reparto)
- Al cierre: ROADMAP.md · docs/memory/session-log.md

## Riesgos técnicos
- **Filtro de embed a 2 niveles** (participa.serie.moderation_status): si
  PostgREST/supabase-js no lo resuelve como se espera, fallback: incluir
  moderation_status en el select de serie y filtrar en TS. Los tests de T1 lo
  detectan de inmediato. Si el typing de .eq rechaza el path, .filter() con el
  operador 'eq' como alternativa tipada.
- **Doble query (metadata + page)**: 2 round-trips por render, aceptado igual
  que en F004 (catálogo pequeño, handle UNIQUE indexado).
- **Cambio de link del reparto**: modifica el comportamiento de FIC-05; el
  test de F004 se actualiza en T3 y el cambio queda documentado. CastList solo
  aparece en fichas aprobadas, así que todo canal enlazado tiene ≥1 serie
  aprobada: el nuevo destino nunca será un 404 desde ese contexto.
- **Prerender en build**: force-dynamic + await params; el build no toca la BD.
- **Seed/fixture compartidos**: cambios aditivos; se verifica que
  catalogo.spec.ts y ficha.spec.ts siguen verdes antes de cerrar T3.

## Qué NO haré (fuera de alcance)
- Conteo de episodios del canal · biografía/descripción · página de edición
  (F008+) · reseñas (F012) · login (F008) · búsqueda (F006) · seed real (F007).
- Migraciones nuevas (el esquema de F002 cubre todo) · dependencias nuevas ·
  tocar RLS · generateStaticParams/ISR · editar la spec de F004.
