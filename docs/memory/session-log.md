# Session Log

## Sesión 1 — Constitución y bootstrap (F001)
- Elegimos nombre ISWDB y stack: Next.js 15 + Supabase/Postgres + Tailwind 4.
- Scaffold con create-next-app; añadidos scripts `typecheck` y `test`.
- Instalado Vitest y creado test de salud para que la suite arranque verde.
- `validate.sh` configurado como puerta única; quedó en verde.
- Próximo: aprobar spec 002 (modelo de datos) y ejecutar su plan.

## Sesión 2 — 002/T1: entorno Supabase local
- Entorno local usa podman rootless (podman 4.9.3 emulando docker) con
  DOCKER_HOST exportado (unix:///run/user/1000/podman/podman.sock).
- Se creó supabase/snippets/ con .gitkeep para que supabase start levante Studio.
- `supabase init` + `supabase start` en verde; instalado @supabase/supabase-js.

## Sesión 3 — 002/T2–T4: migraciones y tests
- Se serializaron los tests de BD (vitest fileParallelism:false) porque
  catalog/social/rls comparten la BD local con cleanups globales.
- T5: types/database.ts se versiona en git (decisión: si el stack local no
  está arriba en CI/CD, la generación falla). Regenerar con npm run gen:types
  cuando cambie el esquema.
- F2: Modelo de datos y migraciones iniciales completada. 3 migraciones (M1
  catálogo, M2 social, M3 RLS+triggers), 21 tests de BD (invariants + RLS),
  tipos TypeScript generados. Stack: Postgres + RLS + triggers de seguridad.

## Sesión 4 — F3: Catálogo público (F003)
- F3: Catálogo público completada. Home con hero + top 5 + últimas 10 +
  chips, página /series con filtros (categoría, canal) + paginación,
  E2E Playwright con validate.sh, force-dynamic en home para evitar
  prerenderizado estático.
- Cierre Lighthouse: streaming con un único Suspense en home (el h1 se emite
  antes de las queries), prefetch={false} en enlaces a /series/[slug] hasta
  F004 y heading-order corregido en /series. Scores finales: / 94–99 perf,
  /series 97 perf, A11y/SEO 100 en ambas.

## Sesión 5 — F4: Ficha de serie (F004)
- F4: Ficha de serie completada. Ruta /series/[slug] (RSC, force-dynamic):
  portada o placeholder, badges de categoría y estado, años, descripcion,
  valoración agregada (AVG 1 decimal + conteo o "Sin valoraciones"), enlace
  externo a playlist, reparto con rol y avatar (placeholder si null) que
  enlaza a /series?canal=<handle>, episodios agrupados por temporada con
  headers. Query getSerieBySlug en lib/ (embeds de categoria, participa+canal,
  valoracion, episodio; agrupación y orden en TS).
- Decisiones del usuario: episodios como link externo a youtube.com/watch
  (target=_blank, rel=noopener noreferrer), sin embeds ni iframes; temporadas
  en listado único con headers; 404 con notFound() para slug inexistente o no
  aprobada.
- Hallazgo T1: el bulk insert de PostgREST toma las columnas del primer
  objeto; keys ausentes en filas posteriores → NULL (no default). Seeds con
  filas uniformes desde entonces.
- Hallazgo T3: notFound() dentro de Suspense devuelve HTTP 200 con la UI de
  not-found (el estado se emite con el shell en streaming); el 404 debe
  decidirse antes de emitir el shell. notFound() en generateMetadata es
  ignorado por el runtime (se conserva como defensa, el efectivo es el de la
  página).
- Hallazgo T4: next/image sin priority emite loading="lazy" en la portada y
  LCP simulado se iba a 2.7–3.0 s; con priority (preload + eager) el LCP
  observado queda en ~215–227 ms. Lighthouse /series/<slug> (mobile):
  Perf 96–97, A11y 100, SEO 100; LCP simulado ~2.6 s, dominado por el JS del
  runtime de Next.js (payload 274 KiB), no por código de la feature.
- Cierre: D13 ajustado (thumbnail derivada, sin caché), ROADMAP 004 ✅,
  validate.sh en verde (45 tests unitarios + 15 E2E).

## Sesión 6 — F5: Ficha de canal (F005)
- F5: Ficha de canal completada. Ruta /canales/<handle> (RSC, force-dynamic):
  avatar circular o placeholder, nombre, handle, conteo de series aprobadas,
  filmografía con SerieCard reutilizado de F003 + badge de rol sobre la
  portada (pointer-events-none). Query getCanalByHandle en lib/canales.ts
  (query única: canal + participa(rol, serie!inner(...)) con filtro
  participa.serie.moderation_status=eq.aprobada; orden en TS: anio_inicio
  desc con null al final → activas antes que finalizadas → valoración media
  desc → created_at desc). Metadata dinámica: title, description
  "<nombre> en ISWDB: N serie(s) como <rol de mayor jerarquía>.", OG con
  avatar si existe.
- Hallazgo importante: Next.js trata cualquier segmento de URL que empieza
  por '@' como slot de parallel routes (isGroupSegment en
  next/dist/shared/lib/segment.js) → /canales/@<handle> devuelve 404 en dev
  y prod, en carga HTML y en navegación cliente. Decisión aprobada: URL
  pública sin '@' (/canales/canal-uno); handleDesdeUrl/handleParaUrl en
  lib/canales.ts normalizan param↔BD. El handle visible en la UI conserva '@'.
- Decisión aprobada: CastList (reparto de la ficha de serie) enlaza a
  /canales/<handle> en lugar del filtro /series?canal=<handle> de F003
  (cambio sobre FIC-05; la spec de F004 no se edita, queda documentado aquí
  y en plan.md de F005).
- next/script no sirve para el script anti-FOUC del tema: strategy="inline"
  no existe en Next 16.3.3 y beforeInteractive encola el script en
  self.__next_s (se ejecuta en el bootstrap, después del DOM listo) → la
  clase .dark no está en DOMContentLoaded y hay flash de tema (verificado
  con Playwright, A/B). Se conserva el <script> síncrono inline en <head>
  con comentario explicativo; el warning dev-only de React 19 no se
  reproduce en ninguna navegación y no existe en el build de producción.
- Cierre: ROADMAP 005 ✅, validate.sh en verde (54 tests unitarios + 21 E2E).
  Lighthouse /canales/<handle> (mobile, prod, seed temporal con avatar real):
  Perf 92-98 (varianza por load average del host 5-8 en 4 cores; con máquina
  descargada alcanza 98). Accessibility 100, SEO 100, BP 100 consistentes;
  LCP 1.3 s (avatar con priority). El warning "upstream image response failed
  404" del servidor en E2E es esperado: los video_ids/avatares del fixture
  son falsos (D13).