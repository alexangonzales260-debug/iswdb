# 003 — Catálogo público · Plan técnico

## Decisiones adoptadas (aprobadas)
1. **Top 5 / hero por AVG(nota) — Opción A**: PostgREST no puede ordenar el
   padre por agregado del hijo. Se calcula AVG(nota) en `lib/` (server-side):
   select de series aprobadas con embed `valoracion(nota)` y orden en TS.
   Catálogo pequeño por diseño (F007: 20–30 series). Si crece, se introduce
   una vista SQL en una feature posterior.
2. **Playwright en validate.sh**: instalar `@playwright/test` (ya aprobado en
   CONSTRAINTS, sin ADR nuevo), `playwright.config.ts` con webServer
   (`next start`), script `test:e2e` y añadido a `validate.sh` tras el build
   (coherente con D12: fail fast si el stack no está arriba).
3. **`categoria.slug` = `text NOT NULL UNIQUE`**: BD vacía (sin backfill).
   Migración nueva aprobada por la spec (CAT-02). Implica actualizar los seeds
   de `tests/db/{catalog,rls,social}.test.ts` que insertan categorias sin slug.
4. **Next 16**: `package.json` ya trae Next 16.3.3 (CONSTRAINTS decía Next 15,
   inconsistencia preexistente del scaffold). Al cierre de F003: actualizar
   CONSTRAINTS a Next 16 + ADR D14 en DECISIONS.md.

## Contexto del repo (hallazgos de planificación)
- **RLS**: `serie_select_public` es `using (true)` → anon puede leer todas las
  series. El filtro "solo aprobadas" se aplica en las queries de `lib/`
  (defensa en la capa de servicio). No se toca el RLS; las políticas de
  moderación llegan con F011. El test de servidor verifica que las queries
  públicas devuelven solo aprobadas con cliente anon.
- **Cliente Supabase**: `@supabase/ssr` está en CONSTRAINTS pero no instalado.
  Para lectura pública anónima basta `@supabase/supabase-js` (ya instalado)
  con un cliente server en `lib/supabase.ts`. `@supabase/ssr` llega con F008
  (sesiones por cookie).
- **Env**: no hay `.env.local`; `.env*` está gitignoreado. Se versiona
  `.env.example` con excepción `!.env.example` en `.gitignore`. El dev server
  necesita `SUPABASE_URL` + `SUPABASE_ANON_KEY` en `.env.local`.
- **Contraste #E85D04** (calculado): sobre blanco ≈ 3.5:1 (falla AA en texto
  normal; pasa en texto grande ≥24px/18.66px bold y componentes UI 3:1);
  sobre negro ≈ 6.0:1 (pasa AA); blanco sobre naranja ≈ 3.5:1. Estrategia:
  `--brand: #E85D04` para acentos y texto grande; variante oscurecida
  `--brand-strong` ≈ #B04A00 (≈5.5:1 sobre blanco) para texto pequeño y
  enlaces en tema light; en dark el #E85D04 es usable como texto. Verificar
  con herramienta de contraste durante el build.
- **next/image**: hosts de portadas desconocidos hasta F007. remotePatterns
  solo `i.ytimg.com`/`img.youtube.com` (D5) + placeholder si `portada_url` es
  null; se revisita en F007.

## Orden de tareas (detalle en tasks.md)
1. T1 — Setup UI (shadcn/ui + Tailwind 4 + lucide-react, tokens de tema).
2. T2 — Migración `categoria.slug` + `gen:types` + seeds de tests.
3. T3 — `lib/` (supabase server + queries series/categorias) + env.
4. T4 — Tests servidor de queries (BD local, anon).
5. T5 — Layout (tema anti-FOUC, header/footer) + componentes compartidos.
6. T6 — Home (`/`).
7. T7 — `/series` + SEO (`generateMetadata`).
8. T8 — E2E Playwright + integración en validate.sh.
9. T9 — Lighthouse + cierre (CONSTRAINTS/D14, ROADMAP, session-log).

## Archivos
**Crear**
- `supabase/migrations/<ts>_add_categoria_slug.sql`
- `lib/supabase.ts` · `lib/series.ts` · `lib/categorias.ts` · `lib/utils.ts`
- `components.json` · `components/ui/{button,card,badge}.tsx`
- `components/{serie-card,empty-state,pagination,category-chips,theme-toggle}.tsx`
- `app/series/page.tsx`
- `tests/lib/series.test.ts`
- `playwright.config.ts` · `e2e/catalogo.spec.ts` · `e2e/global-setup.ts`
- `.env.example`

**Modificar**
- `app/layout.tsx` (lang="es", metadata base + OG, script inline anti-FOUC,
  header con nav + ThemeToggle, footer)
- `app/page.tsx` (home)
- `app/globals.css` (tokens Tailwind 4: brand, dark por clase `.dark`)
- `package.json` (deps aprobadas + script `test:e2e`)
- `validate.sh` (añadir E2E tras build)
- `next.config.ts` (remotePatterns)
- `.gitignore` (`!.env.example`)
- `tests/db/{catalog,rls,social}.test.ts` (seeds con slug)
- Al cierre: `CONSTRAINTS.md` (Next 16), `DECISIONS.md` (D14), `ROADMAP.md`,
  `docs/memory/session-log.md`

## Riesgos técnicos
- **shadcn CLI vs Next 16.3.3**: si el CLI falla, fallback manual
  (components.json + componentes copiados a mano).
- **Filtro por canal en PostgREST**: intento con embed
  `participa!inner(canal!inner(handle))` + `.eq`; fallback: consulta en 2
  pasos (canal por handle → serie_ids de `participa` → `.in('id', …)`).
- **next/image sin hosts de portadas conocidos** (F007): placeholder si null;
  remotePatterns limitados a YouTube.
- **BD vacía**: todas las secciones renderizan empty states; el E2E depende
  del fixture del global-setup (siembra service_role + cleanup).
- **Podman/rootless** (docs/memory/open-questions): el E2E usa `next start`
  post-build; el orden de validate.sh ya lo cubre.
- **metadataBase**: warning de Next sin `NEXT_PUBLIC_SITE_URL`; fallback
  localhost en dev.

## Qué NO haré (fuera de alcance)
- Ficha `/series/<slug>` (F004; en tarjetas solo se genera el href).
- Búsqueda (F006) · Seed real (F007) · Login (F008) · Valoraciones/WR (F009).
- Campo "destacada" ni curación manual del hero (F011+).
- Paginación por cursor (decisión 4 del usuario: offset).
- YouTube API (no aplica a esta feature).
- Dependencias fuera de la lista aprobada (shadcn: clsx, tailwind-merge,
  class-variance-authority, primitives Radix, lucide-react). Nada de
  `next-themes`.
- Editar migraciones ya aplicadas (se crea una nueva encima).
- Tocar RLS (políticas de moderación = F011).
