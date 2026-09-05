# Tasks — Feature 020: Recomendaciones personalizadas

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: lib/recomendaciones.ts + tests de servidor
**Estado**: ✅ Completada
**Objetivo**: Implementar el algoritmo y cubrirlo con fixture.

**Entregables**:
- `lib/recomendaciones.ts` (nuevo):
  - Tipos: `RecomendacionSerie { id, titulo, slug, portada_url, anio_inicio,
    categoria: { nombre, slug } | null }`, `Recomendacion { serie, razon }`.
  - `getRecomendaciones(client, userId, limit = 6)`:
    1. follows: usuario_serie por usuario_id (RLS own).
    2. valoraciones: todas las del usuario (nota + created_at); ≥7 son fuentes,
       TODAS entran en la exclusión (REC-03).
    3. Fuentes en orden canónico: follows created_at asc → valoradas ≥7
       created_at asc; kind 'seguida' prioriza sobre 'valorada'.
    4. categoria_id de cada fuente.
    5. Candidatas: serie aprobada, categoría ∈ fuentes; en TS se excluyen
       follows ∪ todas las valoradas.
    6. Seguidores: createServiceRoleClient().usuario_serie `.in('serie_id',
       candidateIds)` → conteo en TS.
    7. Orden seguidores desc → created_at desc → slice(limit).
    8. Razón: mapa categoria_id→primera fuente ("Porque sigues X" /
       "Porque valoraste X").
  - `getSeriesSimilares(client, serieId, limit = 4)`: misma categoría,
    `id != serieId`, aprobada, orden seguidores desc → created_at desc. Sin razón.
- `tests/lib/recomendaciones.test.ts` (nuevo):
  - `vi.hoisted` con NEXT_PUBLIC_SUPABASE_URL/ANON_KEY **y
    `SUPABASE_SERVICE_ROLE_KEY`** (createServiceRoleClient).
  - requireLocalDb + wipe de usuario_serie/valoracion/participa/episodio/serie/
    canal/categoria + seed propio (categorías A–E).
  - Fixture: owner con sourceA (seguida+valorada 9), sourceB (seguida),
    sourceC (valorada 8), valoradaBaja (nota 5); candidatas candA1/candA2/
    candB1/candC1/candD1; u2/u3 con follows que fijan popularidad
    (candA2=2, candA1=1, candB1=1, candC1=0, candD1=3).
  - Casos getRecomendaciones: solo A/B/C (nunca D, ni candD1 con 3 seguidores)
    · orden seguidores desc + tie created_at desc · limit respetado · sin
    seguidas/valoradas en output (incluye valoradaBaja con nota<7) · razones
    ("Porque sigues sourceA"/"sourceB", "Porque valoraste sourceC") · userNada
    sin datos → [] · sin follows pero con valoración alta → funciona por valorada.
  - Casos getSeriesSimilares: sourceA → [candA2, candA1, valoradaBaja] (sin la
    actual, orden desc) · serie única en su categoría → [] .

**Validación**: `npm test -- --run tests/lib/recomendaciones.test.ts` verde (BD local arriba).

---

## T2: Componente + integración home y ficha
**Estado**: ✅ Completada
**Objetivo**: Mostrar recomendaciones en home (con sesión) y similares en la ficha.

**Entregables**:
- `components/recomendacion-card.tsx` (nuevo, Server Component):
  - Props `{ serie, razon?, headingLevel? }`. Link a `/series/<slug>`, portada
    o placeholder, título (h2/h3), badge de categoría, `<p>` con razon si llega.
- `app/page.tsx` (modificar):
  - `<SeccionRecomendaciones />` como primer bloque tras el intro, dentro del
    Suspense. getUser() cacheada; `!user` → null (REC-05); sin resultados →
    null. `getRecomendaciones(createAuthClient(), user.id, 6)` → grid de
    RecomendacionCard con razon. h2 "Recomendado para ti" aria-labelledby.
- `app/series/[slug]/page.tsx` (modificar):
  - `<SeriesSimilares serie={serie} />` al final de ContenidoFicha (tras
    Episodios). `getSeriesSimilares(createAuthClient(), serie.id, 4)`; sección
    h2 "Series similares" solo si hay ≥1 resultado; RecomendacionCard sin razon.

**Validación**: `npm run lint && npm run typecheck && npm run build` verdes;
smoke manual en dev (con sesión: home muestra sección con razón; sin sesión:
no aparece; cualquier ficha: "Series similares").

---

## T3: E2E Playwright
**Estado**: ✅ Completada
**Objetivo**: Verificar home con/sin sesión y la ficha en el flujo real.

**Entregables**:
- `e2e/recomendaciones.spec.ts` (nuevo):
  - createAuthUserWithUsuario + insert usuario_serie (userId→e2e-01) vía
    service-role.
  - Test 1 (con sesión): login → home → heading "Recomendado para ti" visible,
    ≥1 enlace a serie candidata (e2e-02..08), texto "Porque sigues Serie e2e 1"
    visible.
  - Test 2 (sin sesión): `page.goto('/')` → heading "Recomendado para ti"
    `toHaveCount(0)` (REC-05).
  - Test 3 (ficha): `page.goto('/series/e2e-01')` → heading "Series similares"
    visible con ≥1 enlace de misma categoría y sin "Serie e2e 1".
  - Cleanup: borrar usuario_serie del usuario + deleteAuthUser (cascade).

**Validación**: `npm run test:e2e e2e/recomendaciones.spec.ts` verde; sin regresiones.

---

## T4: validate.sh + cierre
**Estado**: Pendiente
**Objetivo**: Ejecutar validate.sh y actualizar docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 020 ✅.
- `DECISIONS.md`: D26 "Recomendaciones: algoritmo simple, service_role para
  conteo de seguidores (RLS own de usuario_serie), exclusión de todas las
  valoradas (REC-03), razón determinista por orden canónico".
- `docs/memory/session-log.md`: sesión F020.

**Validación**: `./validate.sh` en verde; Definition of Done completa.

---

## Resumen de archivos

### Nuevos (4)
1. `lib/recomendaciones.ts`
2. `components/recomendacion-card.tsx`
3. `tests/lib/recomendaciones.test.ts`
4. `e2e/recomendaciones.spec.ts`

### Modificados (5)
1. `app/page.tsx` (sección "Recomendado para ti")
2. `app/series/[slug]/page.tsx` (sección "Series similares")
3. `ROADMAP.md`
4. `DECISIONS.md`
5. `docs/memory/session-log.md`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| RLS solo-propio de usuario_serie rompe el conteo de seguidores | service-role server-only (patrón D25; M11 ya lo autoriza) |
| Razón no determinista con varias fuentes/categoría | Orden canónico fijo + mapa categoria_id→primera fuente |
| Coste de N queries por request | Catálogo pequeño + `.in()`; follow-up caché si escala (D16) |
| Exclusión ambigua (<7 vs ≥7) | Decisión aprobada: excluir todas las valoradas; test explícito |
| Home no está en `app/(home)` | Se integra en `app/page.tsx` |
| Conteo global expone datos ajenos | Solo se lee un COUNT agregado server-side; nunca se muestra la lista de seguidores |

---

## Fuera de alcance (NO se hace)
- Reseñas/listas/propuestas como input de recomendación
- "Trending" o "popular global"
- Filtros de usuario (categoría preferida)
- ML, embeddings o librerías de recomendación
- Caché/materialización de recomendaciones
- Exportar recomendaciones
- Paginación de las secciones (4–6 por diseño)
- Contador visible de seguidores en la UI
- Migración o cambios de esquema
- Cambios al flujo de follows/valoraciones