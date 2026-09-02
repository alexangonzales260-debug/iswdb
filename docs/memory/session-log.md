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

## Sesión 7 — F7: Seed de series reales (F007)
- F7: Seed de 24 series reales hispanohablantes (81 episodios, 142
  valoraciones, 10 canales, 5 categorías) con video_ids verificadas vía
  oEmbed. Seed idempotente (ON CONFLICT DO NOTHING) ejecutable con
  supabase db reset. Top 5 con empates intencionales resueltos por
  created_at desc. 30 usuarios seed sintéticos.
- Distribución de valoraciones: 6 top (8.5–9.5, 10–20 votos), 12 medias
  (6.0–8.0, 3–8 votos), 6 con 0–2 votos ("Sin valoraciones"). Empates a 9.5
  (karmaland/tortillaland) y a 9.0 (squid-craft-games/marbella-vice)
  resueltos por created_at desc; hero = karmaland.
- Ajustes sobre la propuesta: willex → @willyrex (nombre real); UHC España
  fuera (su canal ElRichMC elevaría a 11 canales, límite spec 8–10) y en su
  lugar Dirty Business (Nexxuz) y Hardcore Salvaje (Willyrex); canales
  añadidos @huevocartoon y @31minutos para la categoría Animación.
- Desviación db:seed: `supabase db query --local -f` rechaza ficheros
  multi-statement ("cannot insert multiple commands into a prepared
  statement"); el script usa psql del host con ON_ERROR_STOP=1 (documentado
  en plan.md y tasks.md).
- Los tests de BD hacen wipe en beforeAll y no dependen del seed (SEED-04);
  tras validate.sh (e2e) el catálogo seed se limpia y se restaura con
  npm run db:seed.
- Cierre: ROADMAP 007 ✅, validate.sh en verde, tag F7.

## Sesión 8 — F8: Login/Registro (F008)
- F8: Login/registro con Supabase Auth (email/password). Server Actions +
  useActionState, header con sesión, /perfil con valoraciones. Fix de
  self-healing por memoización de fetch de Next.js (upsert ignoreDuplicates).
  GoTrue local /admin/users roto con email_change NULL → limpieza vía psql.
- Decisiones aplicadas: solo email/password (OAuth fuera, decisión 1) · sin
  middleware, guard por página con requireUser() · next validado en la action
  con /^\/(?!\/)/ (sin open redirect) · avatar con inicial (sin Storage) ·
  catálogo público anónimo (AUTH-08 verificado en E2E sin sesión).
- Fix getPerfilData: la memoización de fetch de Next deduplicaba los dos GET
  idénticos del self-healing dentro del mismo render (el re-select recibía el
  [] anterior al insert). Upsert con ignoreDuplicates (DO UPDATE degradaría el
  rol de un admin) + cache:'no-store' en el fetch del cliente auth.
- E2E: 5 tests nuevos (auth.spec.ts) con usuarios únicos por ejecución y
  cleanup afterAll; el listado de admin de GoTrue local está roto (scan de
  email_change NULL en usuarios del seed), así que deleteAuthUserByEmail usa
  psql directo (FK cascade).
- Cierre: ROADMAP 008 ✅ (título corregido a "email + password"),
  validate.sh en verde (66 tests unitarios + 26 E2E), tag F8.

## Sesión 9 — F9: Valoraciones + fórmula WR (F009)
- F9: Valoraciones 1-10 + fórmula WR (m=10, C=media global). Rankings
  (top 5, hero, /series, filmografía) ordenan por WR; ficha muestra
  AVG+conteo+histograma. Server Actions con rechazo server-side de series
  no aprobadas (VAL-07). Revalidación de layout tras mutación. 92 unit +
  30 E2E sin regresiones.
- Interpretación de C aprobada: media aritmética de TODAS las notas de
  series aprobadas (estilo IMDb; cada valoración pesa igual, series con 0
  votos no aportan). WR solo ordena, nunca se muestra (VAL-06: AVG+conteo
  en ficha por transparencia). listSeries pasa a fetch-all + sort WR en TS
  + slice (PostgREST no ordena el padre por agregados del hijo); sin
  valoración al final por created_at desc.
- Hallazgo operativo: tras `npm test -- --run` la BD queda con el fixture
  del último archivo (cada archivo hace wipe+seed) → el catálogo en dev
  parece vacío o con series de test. Se restaura con `npx supabase db reset`;
  `npm run db:seed` a solas falla si el fixture dejó categorías con los
  mismos slugs y UUIDs aleatorios (FK de los UUIDs fijos del seed). Tras
  validate.sh (E2E) el cleanup global también deja la BD sin el seed.
- Hallazgo: la primera ejecución de tests justo tras `db reset` puede fallar
  por PostgREST frío (hook timeout de 10s en requireLocalDb); basta con
  re-ejecutar (el mismo motivo de los retries de GoTrue en global-setup).
- Cierre: D16 añadido (derivados sin caché), ROADMAP 009 ✅, validate.sh
  en verde, tag F9.

## Sesión 10 — F6: Búsqueda (F006)
- F6: Búsqueda completada. Página /buscar?q=<término> (RSC, force-dynamic):
  secciones Series (SerieCard reutilizado de F003, orden WR desc VAL-05) y
  Canales (avatar + nombre + handle visible con '@', link /canales/<handle>
  sin '@' por D15); solo se renderizan secciones con resultados; sin q →
  hint (BUS-04) + formulario en la página; sin resultados → EmptyState con
  link a /series (BUS-05). Barra de búsqueda en el header como formulario
  GET puro de servidor (sin JS cliente, sin prefill); en móvil baja a una
  segunda fila (flex-wrap + order-last + w-full). Metadata dinámica
  "Búsqueda: <q> · ISWDB" vía template del layout (BUS-08).
- Decisión clave (aprobada en planificación): el builder de supabase-js no
  puede invocar funciones dentro de los filtros, así que el predicado
  ILIKE + unaccent vive en funciones RPC. Migración única: extensión
  unaccent (schema extensions) + public.buscar_series/public.buscar_canales
  (returns setof, language sql stable, SECURITY INVOKER, search_path fijado
  a public,extensions). El escape de comodines %/_/\ se hace en SQL
  (replace en orden \, %, _). gen:types declara SetofOptions to: "serie"/
  "canal" → .rpc().select(SERIE_SELECT) tipa los embeds sin necesidad del
  fallback por ids. Orden de series: byWrDesc reutilizado (exportado de
  lib/series.ts junto a SERIE_SELECT y toSerieCard; precedente del export
  de toRating en F005).
- Hallazgo operativo (stack local): podman 4.9.3 rechaza el template
  {{.Label}} que usa supabase CLI 2.115.0 al listar contenedores
  ("can't evaluate field Label in type containers.psReporter") → start/stop
  fallan si hay contenedores presentes. Workaround: podman rm -f de los
  contenedores restantes + npx supabase start en limpio (con la lista vacía
  el bug no dispara; el volumen de la BD se conserva). CLI 2.116.0
  disponible pero NO actualizado (stack fijado, decisión de revisión).
- Cierre: D17 añadido (búsqueda con RPC + unaccent), ROADMAP 006 ✅,
  validate.sh en verde (110 tests unitarios + 36 E2E), tag F6. Lighthouse
  /buscar?q=marbella (mobile, prod, 5 auditorías): Perf 79–97 (varianza por
  load average del host ~4–5 en 4 cores; alcanza 97 con máquina descargada,
  patrón F005; LCP 2.6–3.3 s dominado por la portada lazy del grid, mismo
  patrón que /series en F003). Accessibility 100 y SEO 100 consistentes en
  las 5 auditorías; CLS 0.

## Sesión 11 — F10: Admin moderation dashboard (F010)
- F10: Admin dashboard con moderación y CRUD (crear/editar series con
  canales y episodios). RLS cubierto por políticas existentes de M3
  (sin migración). Guard requireMod con notFound() (ADM-04: no revela
  el panel). crearSerie con compensación (fallo hijo → delete por
  cascade). editarSerie en pasos secuenciales idempotentes. Robots
  noindex en /admin. 142 unit + 40 E2E sin regresiones.
- Hallazgo clave (planificación): PostgREST no soporta inserts anidados
  (verificado en 16.1: PGRST204 "Could not find the 'episodio' column of
  'serie'"); la doc confirma que la feature nunca existió. Alternativa
  aprobada: pasos secuenciales con compensación (all-or-nothing efectivo;
  ventana residual asumible). El bulk upsert de episodios nuevos necesita
  defaultToNull:false (Prefer: missing=default) para recibir
  gen_random_uuid() en vez de NULL.
- Hallazgo (Next 16.3.3): notFound() dentro de una Server Action sirve un
  404 HTTP real (action-handler convierte el digest en res.statusCode=404),
  verificado en el fuente del paquete; sin fallback.
- E2E: admin.spec.ts corre primero alfabéticamente (workers=1) y su afterAll
  restaura el fixture exactamente (e2e-16 → pendiente, borrado de series
  creadas y usuarios); el resto de specs pasa sin regresiones.
- Cierre: D9 aclarado (la moderación se materializa en F010; F011 queda para
  aportes de usuarios), ROADMAP 010 ✅, validate.sh en verde, tag F10.

## Sesión 12 — F12: Reseñas (F012)
- F12: Reseñas 50-2000 chars con publicación directa (sin cola de
  moderación). Requiere valoración previa (server-side). Mod/admin puede
  eliminar cualquier reseña. Migración M5 (tabla reseña) + M6 (usuario.email
  para embed) + M7 (restricción de usuario_select_authenticated que exponía
  emails). Email del autor leído vía service-role, truncado server-side.
  Fix de remount del form con key. 182 unit + 46 E2E sin regresiones.
- Hallazgo (seguridad): usuario_select_authenticated (M3) usaba `using (true)`;
  al añadir usuario.email (M6) exponía el email de todos los usuarios a
  cualquier cuenta autenticada vía API raw. M7 restringe el SELECT a la fila
  propia o mod/admin; la app solo lee la fila propia y la lista pública de
  reseñas usa service-role, así que nada se rompió (182 tests verdes).
- Hallazgo (stack local): el admin de GoTrue responde 500 en /admin/users
  ("sql: Scan error on column index 8, name email_change: converting NULL to
  string is unsupported") — listUsers inservible; el helper E2E
  getUserIdByEmail consulta public.usuario en su vez.
- Hallazgo (E2E): getByRole de Playwright matchea el accessible name por
  subcadena ('Eliminar' cazaba 'Eliminar valoración' → exact:true). Además,
  pipear la salida de playwright a grep/head que termina antes deja
  ejecuciones huérfanas que contaminan la BD entre runs; salida a archivo.
- Cierre: D18 añadido, ROADMAP 012 ✅, validate.sh en verde (182 unit + 46
  E2E), tag F12.

## Sesión 13 — F11: Propuestas de series (F011)
- F11: Propuestas de series públicas (sin login). Migración M8
  (proponente_email + user_id nullable en serie, split de
  serie_select_public anon/aprobada + authenticated/true, RPC
  crear_propuesta SECURITY DEFINER que inserta serie+participa en una
  transacción forzando pendiente+user_id null). Slug -prop-<ts>-<rand>.
  Hallazgo PostgreSQL: con RLS activo una fila recién insertada debe ser
  legible por las SELECT policies del rol, por lo que el insert directo
  de anon era inviable → RPC SECURITY DEFINER. 212 unit + 50 E2E.
- Cierre: D9 aclarado (F011 con user_id nullable en serie), ROADMAP 011 ✅,
  validate.sh en verde, tag F11.

## Sesión 14 — F13: Listas personalizadas (F013)
- F13: Listas personalizadas (públicas/privadas) con orden manual.
  Migración M9 (lista + lista_serie + RLS own_or_public vía subconsulta
  al padre). Servicios inyectables LIS-01..06. Botón "Añadir a lista" en
  la ficha. Bug destapado por E2E: descripcion null no admitido por Zod
  (fix .nullable().optional()). 255 unit + 54 E2E.
- Cierre: D19 añadido, ROADMAP 013 ✅, validate.sh en verde, tag F13.

## Sesión 15 — F14: Recuperación de password (F014)
- F14: Recuperación de password vía email (flujo GoTrue nativo).
  Route handler /auth/reset con verifyOtp (token_hash, no PKCE).
  Mensaje genérico anti-enumeración (REC-01). Mailpit para emails locales.
  Bug de host localhost vs 127.0.0.1 detectado por E2E y corregido
  (cookies de sesión en dominio canónico). 262 unit + 56 E2E.
- Cierre: D20 añadido, ROADMAP 014 ✅, validate.sh en verde, tag F14.

## Sesión 16 — F15: Edición de perfil (F015)
- F15: Edición de perfil (password con reauth, email con confirmación,
  display_name). Migración M10 (display_name TEXT NULL con CHECK 3-50).
  config.toml: double_confirm_changes=false para simplificar el flujo.
  Reauth implementado a nivel app con signInWithPassword. 275 unit +
  58 E2E. Hallazgo operativo: contenedores de Supabase parados 10h
  causaron flakiness en tests RLS; resuelto con db reset + start limpio.
- Cierre: D21 añadido, ROADMAP 015 ✅, validate.sh en verde, tag F15.

## Sesión 17 — F16: Dashboard mi actividad (F016)
- F16: Dashboard 'Mi actividad' en /perfil/actividad. Unifica valoraciones,
  reseñas, listas, propuestas + agregados (conteos + promedio). Tabs CSS
  puro con :target (sin componente cliente). Servicios inyectables en
  lib/actividad.ts. 287 unit + 60 E2E. T3 saltado (CSS anchors suficiente).
  Cleanup de E2E requiere delete explícito de propuesta-series (serie.user_id
  es ON DELETE SET NULL).
- Cierre: D22 añadido, ROADMAP 016 ✅, validate.sh en verde (287 unit + 60
  E2E), tag F16.

## Sesión 18 — F17: OAuth Google (F017)
- F17: OAuth con Google vía Supabase Auth (sin implementación manual).
  Browser client factory (lib/supabase-browser.ts) + listener en layout
  (components/supabase-listener.tsx) para intercambio automático de código.
  Botones 'Continuar con Google' en /login y /registro. skip_nonce_check=true
  en local. env vars con default vacío (validate.sh no se rompe sin
  credenciales). Hallazgo operacional: matar dev server stale antes de
  test:e2e (reuseExistingServer reutiliza el puerto). 289 unit + 63 E2E.
  Nota: flujo OAuth real con Google requiere credenciales válidas en
  Google Cloud Console; sin ellas el botón da 401 invalid_client (error
  esperado, el botón funciona).
- Cierre: D23 añadido, ROADMAP 017 ✅, validate.sh en verde (289 unit + 63
  E2E), tag F17.