# 004 — Ficha de serie · Tareas

- [ ] T1 — Query getSerieBySlug + tests de servidor
  lib/series.ts: tipos EpisodioFicha/TemporadaFicha/CanalFicha/SerieFicha ·
  SERIE_FICHA_SELECT con embeds categoria(nombre,slug), participa(rol,
  canal(nombre,handle,avatar_url)), valoracion(nota), episodio(temporada,
  numero,titulo,video_id) · getSerieBySlug(slug) con .eq('slug',slug)
  .eq('moderation_status','aprobada').maybeSingle() → null si no existe ·
  mapper toSerieFicha() en TS: rating con helper extraído (compartido con
  toSerieCard), temporadas asc + episodios por numero asc · lib/format.ts
  (nuevo): ratingTexto (mudado de serie-card.tsx) + truncateDescripcion(160).
  tests/lib/series.test.ts (seed aditivo): episodios ql-01 (T1 e1/e2, T2 e1,
  fuera de orden), ql-10 (1 ep), ql-02 sin episodios · ql-01 con descripcion,
  estado 'finalizada', anio_fin, playlist_url · participa con rol explícito en
  ql-13 (principal/invitado) · avatar_url en un canal. Casos: ficha completa
  ql-01 · ql-10 rating {9.5, 2} · ql-02 temporadas [] · ql-16 (pendiente) →
  null · slug inexistente → null. Asserts de F003 intactos.
  Criterio: `npm test -- --run` verde (suite completa, BD local arriba).

- [ ] T2 — Ruta /series/[slug] + componentes
  app/series/[slug]/page.tsx: force-dynamic · generateMetadata (await params →
  getSerieBySlug → notFound() si null; title: titulo, description truncada 160
  con fallback, canonical, OG images solo con portada) · page con Suspense +
  skeleton (patrón home) y notFound() si null · secciones: cabecera (portada o
  placeholder, h1, badge categoría, badge estado Activa/Finalizada,
  anio_inicio–anio_fin, descripcion, rating o "Sin valoraciones", enlace
  externo a playlist_url si existe), Reparto (h2) → CastList, Episodios (h2) →
  SeasonList o EmptyState "Aún no hay episodios registrados" ·
  components/season-list.tsx (server): h3 "Temporada N" + episodios como <a>
  nativo a youtube.com/watch (target="_blank" rel="noopener noreferrer") con
  thumbnail next/image hqdefault.jpg (aspect-[4/3]), número, título, icono
  ExternalLink, aria-label · components/cast-list.tsx (server): Link a
  /series?canal=<handle> con avatar next/image circular o placeholder, nombre
  y etiqueta de rol (Principal/Colaborador/Invitado) · app/not-found.tsx
  (EmptyState + enlace a inicio) · serie-card.tsx: ratingTexto desde
  lib/format y fuera prefetch={false} + TODO · app/page.tsx: fuera
  prefetch={false} + TODO del hero.
  Criterio: lint + typecheck + build verdes; smoke manual con seed temporal.

- [ ] T3 — E2E Playwright
  e2e/global-setup.ts (aditivo): episodios para e2e-01 (2 temporadas) y e2e-10
  (1 episodio); e2e-02 sin episodios; video_ids estables exportados en FIXTURE;
  e2e-01 con descripcion, estado 'finalizada', anio_fin, playlist_url.
  e2e/ficha.spec.ts (nuevo): home → click tarjeta → ficha (h1, rating, headers
  de temporada) · link de episodio: href youtube.com/watch?v=<id>,
  target="_blank", rel noopener noreferrer, iframe count = 0 · click episodio →
  waitForEvent('page') → URL de la nueva pestaña (sin waitForLoadState) ·
  /series/e2e-02 → empty state · /series/e2e-16 y /series/no-existe → 404 ·
  reparto con rol y enlaces /series?canal=<handle> · metadata: <title>
  "Serie e2e 10 · ISWDB", meta description, og:title.
  Criterio: `npm run test:e2e` verde (ficha + catálogo de F003 sin regresiones).

- [ ] T4 — Lighthouse + cierre
  Seed temporal con video_id real → Lighthouse manual en /series/<slug>
  (Perf ≥90, SEO 100, A11y ≥95; evidencia pegada) → borrar seed ·
  ./validate.sh completo en verde (evidencia pegada) · ROADMAP.md (004 ✅) ·
  docs/memory/session-log.md · DECISIONS.md: ajustar D13 (aprobado) con el
  texto: "D13: Thumbnail de episodios se deriva de
  img.youtube.com/vi/<video_id>/hqdefault.jpg sin caché en BD (cumple D5: solo
  embed oficial, sin API de YouTube). La caché de metadatos (duración, fecha
  publicación) se revisita en F007+ si se integra YouTube Data API." ·
  Commit de cierre: `F4: …`.
  Criterio: Definition of Done completa.
