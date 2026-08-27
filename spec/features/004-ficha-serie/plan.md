# 004 — Ficha de serie · Plan técnico

## Decisiones adoptadas (aprobadas)
1. **Episodios = link externo** a https://www.youtube.com/watch?v=<video_id>
   con target="_blank" rel="noopener noreferrer". Sin embeds ni iframes.
   Thumbnail derivada: img.youtube.com/vi/<video_id>/hqdefault.jpg (sin caché
   en BD; cumple D5).
2. **Temporadas**: listado único con headers ("Temporada 1", "Temporada 2", …).
   Sin tabs (se revisita en F011+ con 10+ temporadas).
3. **Reparto**: avatares con placeholder si avatar_url es null.
4. **Valoraciones**: solo agregado (AVG 1 decimal + conteo, o "Sin valoraciones").
5. **404**: notFound() de Next.js para slug inexistente o moderation_status ≠ 'aprobada'.

## Contexto del repo (hallazgos de planificación)
- **RLS**: serie_select_public es using(true); el filtro "solo aprobadas" vive en
  lib/ (igual que F003). getSerieBySlug añade .eq('moderation_status','aprobada')
  y devuelve null si no hay fila → la página llama a notFound().
- **participa.rol**: check ('principal','colaborador','invitado'), default
  'colaborador'. Etiquetas UI: Principal / Colaborador / Invitado.
- **Metadata**: el layout ya tiene template "%s · ISWDB"; generateMetadata
  devuelve title: titulo, description truncada a 160 y OG con portada si existe.
- **next/image**: remotePatterns para img.youtube.com ya configurado (F003).
- **Patrón home**: force-dynamic + Suspense con skeleton; se replica en la ficha.
- **TODOs pendientes de F003**: quitar prefetch={false} en serie-card.tsx y
  app/page.tsx en cuanto exista /series/[slug].
- **validate.sh**: sin cambios; vitest recoge tests/** y playwright e2e/**.
- **Next 16**: params es Promise<{ slug }> en page y generateMetadata.
- **Doble query metadata+página**: generateMetadata y page llaman a
  getSerieBySlug por separado (sin React cache()), igual que F003 con
  getCategorias. Catálogo pequeño + slug con índice UNIQUE; si Lighthouse se
  queja, follow-up con cache().

## Orden de tareas (una sesión de Build por tarea)

### T1 — Query getSerieBySlug + tests de servidor
- lib/series.ts:
  - Nuevos tipos: EpisodioFicha { numero, titulo, video_id },
    TemporadaFicha { numero, episodios }, CanalFicha { nombre, handle,
    avatar_url, rol }, SerieFicha { id, titulo, slug, portada_url, descripcion,
    estado, anio_inicio, anio_fin, playlist_url, categoria, canales, rating,
    temporadas }.
  - SERIE_FICHA_SELECT con embeds: categoria ( nombre, slug ),
    participa ( rol, canal ( nombre, handle, avatar_url ) ),
    valoracion ( nota ), episodio ( temporada, numero, titulo, video_id ).
    Sin !inner (no hay que filtrar el padre por hijo).
  - getSerieBySlug(slug): .eq('slug', slug).eq('moderation_status','aprobada')
    .maybeSingle() → null si no existe. Mismo estilo que lo existente:
    unwrap() + mapper toSerieFicha() en TS.
  - Agrupación de episodios en TS: temporadas asc, episodios por numero asc
    (se insertan desordenados en tests para verificarlo).
  - Refactor menor: extraer el cálculo de rating (notas → SerieRating|null)
    a helper interno reutilizado por toSerieCard y toSerieFicha.
- lib/format.ts (nuevo): ratingTexto(rating) (mudado desde serie-card.tsx) y
  truncateDescripcion(texto, 160).
- tests/lib/series.test.ts (extender el seed existente, aditivo):
  - episodios: ql-01 con 2 temporadas (T1 e1/e2, T2 e1, insertados fuera de
    orden) · ql-10 con 1 episodio · ql-02 sin episodios.
  - ql-01: descripcion, estado 'finalizada', anio_fin, playlist_url.
  - participa con rol explícito en ql-13 (principal/invitado); avatar_url en
    un canal.
  - Casos nuevos: ficha completa de ql-01 (campos + categoria + canales con
    rol + rating null + temporadas ordenadas) · ql-10 rating {9.5, 2} ·
    ql-02 temporadas [] · ql-16 (pendiente) → null · slug inexistente → null.
  - Los asserts existentes no se tocan (el seed es aditivo; los selects de
    catálogo siguen igual).
- Verificación: npm test -- --run (suite completa, BD local arriba).

### T2 — Ruta /series/[slug] + componentes
- app/series/[slug]/page.tsx:
  - export const dynamic = 'force-dynamic' (mismo criterio que home).
  - generateMetadata: await params → getSerieBySlug → si null, notFound();
    title: titulo (el template del layout añade " · ISWDB"), description:
    descripcion truncada a 160 (fallback si es null), alternates.canonical,
    openGraph con images solo si portada_url existe.
  - Page: await params → Suspense con skeleton (patrón home) → contenido que
    llama getSerieBySlug y hace notFound() si null.
  - Secciones: cabecera (portada o placeholder, h1, badge categoría, badge
    estado Activa/Finalizada, anio_inicio–anio_fin, descripcion, rating con
    Star o "Sin valoraciones", enlace externo a playlist_url si existe) ·
    Reparto (h2) → CastList · Episodios (h2) → SeasonList o EmptyState
    "Aún no hay episodios registrados".
- components/season-list.tsx (nuevo, server): por temporada h3 "Temporada N" +
  lista de episodios; cada episodio es <a> nativo a la URL de YouTube
  (target="_blank" rel="noopener noreferrer") con thumbnail next/image
  (hqdefault.jpg, aspect-[4/3]), número, título, icono ExternalLink y
  aria-label "Ver <título> en YouTube (se abre en nueva pestaña)".
- components/cast-list.tsx (nuevo, server): Link a /series?canal=<handle> con
  avatar (next/image circular o placeholder con icono), nombre y etiqueta de rol.
- app/not-found.tsx (nuevo): 404 estilizado coherente (EmptyState + enlace a
  inicio); lo usa notFound() en toda la app.
- components/serie-card.tsx: importar ratingTexto desde lib/format.ts; quitar
  prefetch={false} + TODO.
- app/page.tsx: quitar prefetch={false} + TODO del hero.
- Verificación: npm run lint + typecheck + build; smoke manual con seed
  temporal (insert en Studio/SQL y borrado posterior) para ver la ficha con datos.

### T3 — E2E Playwright
- e2e/global-setup.ts (aditivo; los tests de F003 deben seguir verdes):
  - episodios para e2e-01 (2 temporadas) y e2e-10 (1 episodio); e2e-02 sin
    episodios; video_ids estables de prueba exportados en FIXTURE.
  - e2e-01: descripcion, estado 'finalizada', anio_fin, playlist_url.
- e2e/ficha.spec.ts (nuevo):
  - home → click en tarjeta → ficha renderiza (h1, rating, headers de temporada).
  - Link de episodio: href = https://www.youtube.com/watch?v=<id>,
    target="_blank", rel contiene noopener noreferrer; iframe count = 0.
  - Click en episodio → context.waitForEvent('page') → la nueva pestaña
    solicita la URL de YouTube (sin esperar carga: el entorno puede no tener
    red externa).
  - /series/e2e-02 → empty state "Aún no hay episodios registrados".
  - /series/e2e-16 (pendiente) y /series/no-existe → 404 (texto del
    not-found propio).
  - Reparto: canales con rol y enlace a /series?canal=<handle>.
  - Metadata: <title> "Serie e2e 10 · ISWDB", meta description y og:title.
- Verificación: npm run test:e2e (ficha + catálogo completos).

### T4 — Lighthouse + cierre
- Seed temporal con video_id real (thumbnail válida) → Lighthouse manual en
  /series/<slug> (Perf ≥90, SEO 100, A11y ≥95) → pegar evidencia → borrar seed.
- ./validate.sh completo en verde (evidencia pegada).
- Docs: ROADMAP.md (004 ✅), docs/memory/session-log.md, y ajuste del texto de
  D13 en DECISIONS.md (thumbnail = URL derivada, sin caché) si se aprueba.
- Commit de cierre: F4: …

## Archivos
**Crear**
- spec/features/004-ficha-serie/{spec.md,plan.md}
- app/series/[slug]/page.tsx · app/not-found.tsx
- components/season-list.tsx · components/cast-list.tsx
- lib/format.ts
- e2e/ficha.spec.ts

**Modificar**
- lib/series.ts (getSerieBySlug + tipos + helper de rating)
- tests/lib/series.test.ts (seed aditivo + casos nuevos)
- components/serie-card.tsx (ratingTexto de lib/format, sin prefetch)
- app/page.tsx (sin prefetch en el hero)
- e2e/global-setup.ts (fixture aditivo)
- Al cierre: ROADMAP.md · docs/memory/session-log.md · DECISIONS.md (D13, si se aprueba)

## Riesgos técnicos
- **D13 vs decisión 1**: D13 menciona caché de thumbnails en F004; el enfoque
  elegido (URL derivada) la vuelve innecesaria. Se propone ajustar D13 en el
  cierre; requiere aprobación explícita.
- **Nueva pestaña a youtube.com en E2E**: sin red externa la navegación falla;
  el test solo verifica el evento popup y la URL solicitada, nunca waitForLoadState.
- **Prerender en build**: la página usa await params (dinámica) y además
  force-dynamic por coherencia con home; el build no toca la BD.
- **Doble query (metadata + page)**: 2 round-trips a Supabase por render.
  Aceptable (catálogo pequeño, slug UNIQUE indexado); follow-up con React
  cache() solo si Lighthouse lo señala.
- **Thumbnails inexistentes con video_ids falsos** en tests/E2E: se verifican
  atributos/alt, no píxeles; el seed del Lighthouse usa un video_id real.
- **Seed/fixture compartidos**: los cambios en seeds son aditivos; se verifica
  que catalogo.spec.ts y los tests de F003 siguen verdes antes de cerrar T1/T3.

## Qué NO haré (fuera de alcance)
- Valoraciones con fórmula WR y distribución (F009) · Reseñas (F012) ·
  Login (F008) · Búsqueda (F006) · Seed real (F007).
- Embeds/iframes de YouTube ni caché de metadatos vía YouTube API
  (duración, fecha publicación).
- Tabs por temporada (F011+) · curación manual de hero/destacados (F011+).
- Migraciones nuevas (el esquema de F002 ya cubre todo) · dependencias nuevas
  · tocar RLS · generateStaticParams/ISR.
