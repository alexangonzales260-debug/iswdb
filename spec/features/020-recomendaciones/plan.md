# Plan técnico — Feature 020: Recomendaciones personalizadas

## Decisiones adoptadas (aprobadas por el usuario)
1. Algoritmo: collaborative filtering simple + content-based. Input = follows
   (F018) + valoraciones ≥7 (F009). Output = series NO seguidas/valoradas de
   la misma categoría, ordenadas por nº de seguidores, con razón
   "Porque sigues <serie>" / "Porque valoraste <serie>". Sin ML ni librerías.
2. Cálculo en servidor (RSC), sin caché, en cada request (catálogo pequeño).
3. UI: home "Recomendado para ti" (solo con sesión, grid 6 + razón) · ficha
   "Series similares" (grid 4, misma categoría, sin razón). Sin sesión →
   home sin sección.
4. Alcance: solo follows + valoraciones. Sin reseñas/listas/propuestas, sin
   trending, sin filtros de usuario.
5. Sin migración: usa usuario_serie, valoracion, serie y categoria existentes.
6. Tests: servidor (getRecomendaciones con fixture) + E2E (home + ficha).
7. **Confirmado durante planificación**: la exclusión (REC-03) cubre TODAS las
   valoradas (cualquier nota), no solo ≥7. El set de categorías-fuente sigue
   siendo follows ∪ ≥7; el set de exclusión es follows ∪ valoraciones completas.

## Decisiones técnicas (justificadas)

### 1. `lib/recomendaciones.ts` (nuevo) — servicios inyectables
Mismo patrón que lib/follows.ts / lib/valoraciones.ts: reciben el cliente por
parámetro. Para resolver las fuentes y candidatas basta el cliente de sesión
(usuario_serie = RLS own, valoracion = pública D11, serie = pública). El
**conteo de seguidores** requiere leer usuario_serie de TODOS los usuarios y el
RLS de M11 es solo-propio: se usa `createServiceRoleClient()` (lib/supabase.ts,
patrón D25; M11 ya otorga `select` a service_role: "service_role queda fuera
del RLS para las lecturas server-side"). Server-only, jamás al bundle.

```typescript
export interface RecomendacionSerie {
  id: string
  titulo: string
  slug: string
  portada_url: string | null
  anio_inicio: number | null
  categoria: { nombre: string; slug: string } | null
}

export interface Recomendacion {
  serie: RecomendacionSerie
  razon: string
}

export async function getRecomendaciones(
  client: AuthClient,
  userId: string,
  limit = 6
): Promise<Recomendacion[]>

export async function getSeriesSimilares(
  client: AuthClient,
  serieId: string,
  limit = 4
): Promise<RecomendacionSerie[]>
```

**getRecomendaciones — algoritmo** (8 pasos):
1. Follows: `client.from('usuario_serie').select('serie_id, created_at').eq('usuario_id', userId)`
   (RLS own permite leer las propias).
2. Valoraciones: `client.from('valoracion').select('serie_id, nota, created_at').eq('user_id', userId)`.
   `> = 7` son fuentes; TODAS entran en el set de exclusión (decisión 7).
3. Unir fuentes en orden canónico determinista: primero follows por
   `created_at` asc, luego valoradas ≥7 por `created_at` asc (sin repetir las
   ya seguidas). `kind: 'seguida' | 'valorada'` (priorizar 'seguida' si la
   serie está en ambos sets). Set de exclusión = follows ∪ todas las valoradas.
4. `categoria_id` de cada fuente: `serie.select('id, categoria_id').in('id', sourceIds)`.
5. Candidatas: `serie.select('id, titulo, slug, portada_url, anio_inicio, categoria ( nombre, slug ), created_at')`
   `.in('categoria_id', catsFuente).eq('moderation_status', 'aprobada')`.
6. Filtro en TS: descartar cualquier id del set de exclusión. Conteo de
   seguidores: `createServiceRoleClient().from('usuario_serie').select('serie_id').in('serie_id', candidateIds)`
   → agregar en TS (Map serie_id → count).
7. Ordenar por seguidores desc; empate → `created_at` desc (determinista,
   patrón byWrDesc de F003). `slice(0, limit)`.
8. Razón: mapa `categoria_id → primera fuente` en el orden canónico del paso 3
   (determinista). `kind === 'seguida'` → `Porque sigues <titulo>`;
   `kind === 'valorada'` → `Porque valoraste <titulo>`.

**getSeriesSimilares**:
1. `serie.select('categoria_id').eq('id', serieId).maybeSingle()` → null si no existe.
2. Candidatas: misma categoría, `id != serieId`, `moderation_status = 'aprobada'`.
3. Conteo de seguidores vía service-role (igual que arriba) → orden desc,
   empate `created_at` desc → `slice(0, limit)`.
4. Sin razón (REC-04 no la exige).

### 2. Integración home — `app/page.tsx` (modificar)
La home es `app/page.tsx` (NO existe `app/(home)/`). Dentro del Suspense actual
se añade `<SeccionRecomendaciones />` como primer bloque (tras el h1/intro):
- `getUser()` cacheada (patrón SeguirSerie de la ficha); si `!user` → `null`
  (REC-05).
- `createAuthClient()` → `getRecomendaciones(client, user.id, 6)`.
- Si `recomendaciones.length === 0` → `null` (usuario sin datos no ve bloque).
- Sección `aria-labelledby="recomendado-heading"` con h2 "Recomendado para ti"
  y grid `grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5` de
  `<RecomendacionCard serie razon />`.

### 3. Integración ficha — `app/series/[slug]/page.tsx` (modificar)
Se añade `<SeriesSimilares serie={serie} />` al final de `ContenidoFicha`
(después de Episodios):
- `getSeriesSimilares(createAuthClient(), serie.id, 4)` (público, funciona sin
  sesión).
- Sección solo si `similares.length > 0`; grid de `<RecomendacionCard serie />`
  sin razón.

### 4. `components/recomendacion-card.tsx` (nuevo)
Server Component (igual que serie-card.tsx): Link a `/series/<slug>`, portada o
placeholder, título (`headingLevel` opcional 2|3), badge de categoría y, si
llega la prop `razon`, `<p>` con la razón. Props:
`{ serie: RecomendacionSerie; razon?: string; headingLevel?: 2 | 3 }`.

### 5. Tests de servidor — `tests/lib/recomendaciones.test.ts`
Sigue el patrón de tests/lib/follows.test.ts: `requireLocalDb()`, `vi.hoisted`
seteando `NEXT_PUBLIC_SUPABASE_*` **y `SUPABASE_SERVICE_ROLE_KEY`** (lo necesita
createServiceRoleClient), `createTestUser`/`signInTestUser`/`deleteTestUser`/
`dbAdmin`, cleanups propios. Fixture:
- Categorías A, B, C, D (+ E para caso vacío de similares).
- Fuentes del owner: `sourceA` (cat A, seguida + valorada 9 → kind "seguida"),
  `sourceB` (cat B, seguida), `sourceC` (cat C, valorada 8 → "valorada"),
  `valoradaBaja` (cat A, valorada con nota 5 → **excluida** pero sin ser fuente).
- Candidatas: `candA1`, `candA2` (cat A), `candB1` (cat B), `candC1` (cat C),
  `candD1` (cat D, la más seguida a propósito: 3 seguidores → debe quedar fuera
  por categoría).
- Usuarios "otros" u2/u3 que siguen candidatas para fijar popularidad:
  candA2 = 2, candA1 = 1, candB1 = 1, candC1 = 0.
- `created_at` explícitos para tie-breaks deterministas.
- `userNada` sin follows/valoraciones.

Casos:
- Devuelve solo series de A/B/C (nunca D, ni siquiera la popular candD1).
- Orden por seguidores desc → candA2 primero; tie caída desc.
- Límite respetado (`limit = 2` → [candA2, candA1]).
- Ninguna serie seguida/valorada en el output: sourceA/B/C y `valoradaBaja`
  (nota<7) ausentes.
- Razones: candA1/candA2 → "Porque sigues sourceA"; candB1 → "Porque sigues
  sourceB"; candC1 → "Porque valoraste sourceC".
- Sin follows ni valoraciones (`userNada`) → `[]`.
- `getSeriesSimilares`: sourceA → [candA2, candA1, valoradaBaja] (sin la
  actual, orden seguidores desc); serie única en su categoría → `[]`.

### 6. E2E — `e2e/recomendaciones.spec.ts`
Sigue el patrón de e2e/follows.spec.ts (workers=1, fixture global con e2e-01..
e2e-08 en "Minecraft"). Tres casos:
- **Con sesión**: `createAuthUserWithUsuario(...)`; insertar el follow
  userId→e2e-01 vía service-role (o cliente anon; al ser RLS own, service-role
  garantiza el insert). Login → home → heading "Recomendado para ti" visible,
  ≥1 enlace a serie (e2e-02..08) y texto "Porque sigues Serie e2e 1" visible.
- **Sin sesión**: `page.goto('/')` sin login → heading "Recomendado para ti"
  con `toHaveCount(0)` (REC-05).
- **Ficha**: `page.goto('/series/e2e-01')` → heading "Series similares"
  visible con ≥1 enlace de la misma categoría (p. ej. "Serie e2e 2"), sin
  incluir "Serie e2e 1".
- Cleanup: borrar `usuario_serie` del usuario + `deleteAuthUser` (cascade).

## Contexto del repo (hallazgos de planificación)
- **La home es app/page.tsx** (no hay route group `(home)`; la ruta `/` es
  `app/page.tsx` con `dynamic = "force-dynamic"` y un único Suspense).
- **RLS de usuario_serie es solo-propio (D24/M11)**: el conteo global de
  seguidores exige service_role; `createServiceRoleClient()` (F012) ya existe y
  M11 otorga select a service_role. `.env.example` documenta
  SUPABASE_SERVICE_ROLE_KEY (server-only).
- **Patrón de servicios inyectables**: lib/follows.ts, lib/valoraciones.ts.
- **Patrón de secciones async en home/ficha**: funciones componente que llaman
  getUser() cacheada y devuelven null sin sesión (SeguirSerie en la ficha).
- **Patrón de tarjeta**: components/serie-card.tsx (link, portada, badge,
  headingLevel). RecomendacionCard lo reutiliza visualmente + razon.
- **Patrón de tests DB**: tests/db/env.ts (requireLocalDb, createTestUser,
  signInTestUser, deleteTestUser, dbAdmin, unwrap) + wipe de tablas estilo
  tests/lib/valoraciones.test.ts.
- **Patrón E2E**: global-setup.ts exporta createAuthUserWithUsuario/
  deleteAuthUser/slugSerie/FIXTURE.

## Archivos a crear/modificar

### Nuevos
1. `lib/recomendaciones.ts` — Servicios inyectables (getRecomendaciones,
   getSeriesSimilares) + tipos.
2. `components/recomendacion-card.tsx` — Tarjeta con razón opcional.
3. `tests/lib/recomendaciones.test.ts` — Tests de servidor con fixture.
4. `e2e/recomendaciones.spec.ts` — Test E2E.

### Modificar
1. `app/page.tsx` — Sección "Recomendado para ti" (solo con sesión).
2. `app/series/[slug]/page.tsx` — Sección "Series similares".
3. `ROADMAP.md` — 020 ✅ (cierre).
4. `DECISIONS.md` — D26 (cierre).
5. `docs/memory/session-log.md` — sesión F020 (cierre).

## Riesgos técnicos

| Riesgo | Mitigación |
|--------|------------|
| Conteo de seguidores choca con RLS de usuario_serie (solo-propio) | `createServiceRoleClient()` server-only (patrón D25); M11 ya otorga select a service_role. Nunca NEXT_PUBLIC. Cubierto en tests con SUPABASE_SERVICE_ROLE_KEY |
| Razón no determinista con varias fuentes por categoría | Orden canónico fijo (follows created_at asc → valoradas ≥7 created_at asc) + mapa categoria_id→primera fuente; empates resueltos con created_at desc |
| Varias queries por request (fuentes, valoraciones, candidatas, conteo) | Catálogo pequeño (≈24 series) y sin caché por decisión; conteo acotado con `.in('serie_id', candidateIds)`. Follow-up caché si crece (D16) |
| Exclusión vs literal del algoritmo (solo ≥7) | Decisión aprobada: excluir TODAS las valoradas (REC-03). Test explícito con valorada nota<7 |
| Ruta de home en el enunciado (`app/(home)/`) no existe | Corregido: la home es `app/page.tsx` |
| `getUser()` sin sesión en la ficha | Mismo patrón existente: componente devuelve null; getUser cacheada |
| E2E comparte fixture (workers=1) | Cleanup propio (usuario_serie + deleteAuthUser cascade); no toca usuario_serie de otras specs |

## Qué NO haré (fuera de alcance)
- Input de reseñas, listas o propuestas en las recomendaciones
- "Trending" o "popular global"
- Filtros de usuario (categoría/género preferido)
- ML, embeddings o librerías de recomendación
- Caché o materialización de recomendaciones
- Exportar recomendaciones
- Paginación de la sección (grid de 4–6 por diseño)
- Mostrar el nº de seguidores en la UI (solo orden interno)
- Migración o cambios de esquema (usuario_serie/valoracion cubren el caso)
- Cambiar el flujo de follows/valoraciones (solo lectura)