# 003 — Catálogo público · Tareas

- [ ] T1 — Setup UI (shadcn)
  Instalar deps aprobadas (clsx, tailwind-merge, CVA, Radix, lucide-react) vía
  `npx shadcn@latest init` + `add button card badge`; components.json; lib/utils.ts
  (cn); tokens Tailwind 4 en globals.css (brand #E85D04 + variante accesible
  ~#B04A00 para light, dark por clase .dark). Fallback manual si el CLI falla con Next 16.
  Criterio: `npm run dev` compila; botones/card/badge renderizan en ambos temas.

- [ ] T2 — Migración categoria.slug
  supabase/migrations/<ts>_add_categoria_slug.sql: `slug text NOT NULL UNIQUE`
  (+ índice único implícito). `npm run gen:types`. Actualizar seeds de
  tests/db/{catalog,rls,social}.test.ts para pasar slug.
  Criterio: `supabase db reset` limpio; suite de tests 002 verde de nuevo.

- [ ] T3 — lib/ (queries server-side)
  lib/supabase.ts (cliente server, anon key vía env) · lib/series.ts:
  getHeroSerie, getTopSeries(5), getLatestSeries(10), listSeries({categoria, canal,
  page}) — siempre moderation_status='aprobada', AVG(nota) calculado en lib/
  (Opción A), count exact + offset 12/pág · lib/categorias.ts (chips) ·
  .env.example versionado (excepción !.env.example en .gitignore).
  Criterio: typecheck verde; queries tipadas con types/database.ts.

- [ ] T4 — Tests servidor de queries
  tests/lib/series.test.ts (BD local, seed service_role, lectura anon):
  filtros categoría/canal, paginación (pág 2, total/páginas), solo aprobadas,
  orden top 5 (AVG desc, mín 1 valoración, empate → created_at desc), hero,
  últimas 10, casos vacíos.
  Criterio: tests verdes con stack local; sin skipIf (D12).

- [ ] T5 — Layout, tema y componentes compartidos
  app/layout.tsx: lang="es", metadata base + OG, script inline anti-FOUC,
  header (nav + ThemeToggle) y footer · components/: serie-card (portada o
  placeholder, título, año, categoría, canales, AVG 1 decimal + conteo o
  "Sin valoraciones", href /series/<slug>), empty-state, pagination (prev/next),
  category-chips, theme-toggle (cliente: .dark + localStorage, default sistema).
  Criterio: toggle persiste tras recarga sin FOUC (manual).

- [ ] T6 — Home (/)
  app/page.tsx: hero (aprobada mejor valorada) + top 5 + últimas 10 + chips de
  categoría → /series?categoria=<slug>. Empty states por sección con BD vacía.
  Criterio: GET / sin errores con BD vacía y con datos.

- [ ] T7 — /series + SEO
  app/series/page.tsx: filtros ?categoria/?canal combinables + ?page=N (12/pág,
  prev/next) · generateMetadata dinámico (title/description/OG por categoría/
  canal/página) · metadataBase vía NEXT_PUBLIC_SITE_URL (fallback localhost) ·
  next.config.ts remotePatterns i.ytimg.com/img.youtube.com.
  Criterio: filtros y paginación correctos; metadata visible en el HTML.

- [ ] T8 — E2E Playwright + validate.sh
  Instalar @playwright/test · playwright.config.ts (webServer next start) ·
  e2e/global-setup.ts (fixture service_role: 2 categorías, 2 canales, 15
  aprobadas → 2 páginas, 1 pendiente; cleanup) · e2e/catalogo.spec.ts: home →
  filtro → paginación → hrefs de tarjetas; la pendiente no aparece ·
  script test:e2e + añadir a validate.sh tras build.
  Criterio: E2E verde; validate.sh completo en verde.

- [ ] T9 — Cierre
  Lighthouse manual en / y /series (Perf ≥90, SEO 100, A11y ≥95; evidencia
  pegada) · CONSTRAINTS → Next 16 + ADR D14 en DECISIONS.md · ROADMAP 003 ✅ ·
  docs/memory/session-log.md.
  Criterio: Definition of Done completa.
