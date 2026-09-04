# Plan técnico — Feature 018: Seguimiento de series (follow/unfollow)

## Decisiones adoptadas (aprobadas por el usuario)
1. Migración M11 con tabla usuario_serie: usuario_id, serie_id, created_at,
   UNIQUE(usuario_id, serie_id), FK cascade a usuario y serie.
2. UI: botón "Seguir/Siguiendo" en la ficha + página /perfil/seguidas.
3. Alcance simple: sin categorías, sin notas personales en el follow.
4. Feature independiente de valoraciones/reseñas/listas.
5. MIGRACIÓN M11 APROBADA EXPLÍCITAMENTE (CONSTRAINTS): tabla + RLS + grants.
6. Notificaciones fuera de scope (follow-up F019).

## Decisiones técnicas (justificadas)
1. **Migración M11** (patrón M2/M9, aprobada explícitamente):
   - `usuario_serie`: usuario_id uuid NOT NULL → public.usuario(id) on delete cascade;
     serie_id uuid NOT NULL → public.serie(id) on delete cascade;
     created_at timestamptz NOT NULL DEFAULT now();
     UNIQUE(usuario_id, serie_id) (FOL-08).
   - Sin trigger updated_at: follows no requieren update (solo created_at).
   - Índices: `usuario_serie_usuario_idx` (usuario_id) — /perfil/seguidas;
     `usuario_serie_serie_idx` (serie_id) — "¿quién sigue esta serie" (follow-up).
   - Grants patrón M2: select a anon/authenticated/service_role;
     insert/delete a authenticated/service_role.
   - RLS (lectura/escritura propia, patrón F009/F013):
     - `usuario_serie_select_own`: for select to anon, authenticated
       using (usuario_id = auth.uid()).
     - `usuario_serie_insert_own`: for insert to authenticated
       with check (usuario_id = auth.uid()).
     - `usuario_serie_delete_own`: for delete to authenticated
       using (usuario_id = auth.uid()).
   - FK cascade: borrar usuario → follows borrados; borrar serie → follows
     borrados (FOL-07).
   - Tras aplicar: supabase db reset + npm run gen:types.

2. **Servicios inyectables** (patrón F009/F012/F013): seguirSerie(client, serieId),
   dejarDeSeguirSerie(client, serieId), estaSiguiendo(client, serieId),
   listMisSeguidas(userId) con join serie (titulo, slug, portada_url).
   Los de escritura reciben AuthClient (sesión); los de lectura pueden usar
   cliente anon o recibir userId.

3. **Server Actions** (lib/follows-actions.ts, "use server"): patrón
   valoraciones-actions. accionSeguir(serieId) y accionDejarDeSeguir(serieId)
   con requireUser({ next, message }) (AUTH-06) → createAuthClient() → servicio
   → revalidatePath('/series/<slug>') + revalidatePath('/perfil/seguidas').
   Revalidación acotada (no global): solo afecta la ficha y la página de
   seguidas.

4. **Componente follow-button.tsx** ("use client"): recibe serieSlug +
   siguiendo (bool inicial). useTransition + alterna estado (optimista).
   Llama a accionSeguir/accionDejarDeSeguir. Sin sesión → no se renderiza
   (FOL-06). Cambia texto "Seguir" ↔ "Siguiendo" y clase visual.

5. **/perfil/seguidas** (RSC, force-dynamic): requireUser({ next: "/perfil/seguidas" })
   → listMisSeguidas(userId) → grid de tarjetas de series seguidas (portada,
   título, link a ficha). EmptyState si no sigue ninguna.

6. **Integración en ficha**: <FollowButton /> visible solo con sesión. Se
   obtiene siguiendo inicial con estaSiguiendo(client, serieId). Se renderiza
   en la cabecera de la ficha, junto al rating o debajo del título.

7. **Integración en /perfil**: link "Ver mis series seguidas" junto a
   "Ver mi actividad" (F016) en la sección "Datos de la cuenta".

8. **Tests de servidor**: seguir/dejar/toggle (idempotente), UNIQUE (duplicado
   → 23505), RLS (propio vs ajeno), FK cascade (borrar serie → follow borrado).
   Patrón tests/db/ con requireLocalDb + fixtures propios + createTestUser/
   signInTestUser/deleteTestUser.

9. **Test E2E Playwright**: seguir desde ficha → visible en /perfil/seguidas →
   dejar de seguir → desaparece. Patrón e2e/ con createAuthUserWithUsuario +
   cleanup deleteAuthUser → cascade.

## Contexto del repo (hallazgos de planificación)
- **Patrón de migración**: M2 (20260826155429_create_catalog_tables.sql) establece
  el patrón de FKs, unique, grants y RLS. M9 (20260828223000_create_listas.sql)
  extiende con tabla+RLS+grants. M11 sigue el mismo estilo.
- **Patrón de servicios inyectables**: lib/valoraciones.ts, lib/listas.ts,
  lib/reseñas.ts. Funciones que reciben AuthClient por parámetro, testeables
  sin request context de Next.
- **Patrón Server Actions**: lib/valoraciones-actions.ts, lib/listas-actions.ts,
  lib/reseñas-actions.ts. requireUser + createAuthClient + servicio +
  revalidatePath.
- **Patrón de componente cliente con botón**: rating-selector.tsx ("use client")
  con useTransition y llamada a actions. follow-button.tsx sigue el mismo
  patrón.
- **Patrón de página protegida RSC**: app/perfil/page.tsx, app/perfil/actividad/
  page.tsx, app/listas/page.tsx. requireUser + createAuthClient + servicio.
- **Patrón de ficha**: app/series/[slug]/page.tsx con getUser + secciones
  dinámicas. Se añade <FollowButton /> junto a existentes.
- **Patrón de tests DB**: tests/db/ con requireLocalDb + fixtures + createTestUser/
  signInTestUser/deleteTestUser + dbAdmin. Patrón tests/db/listas.test.ts.
- **Patrón E2E**: e2e/global-setup.ts exporta createAuthUserWithUsuario,
  deleteAuthUser. Seed vía dbAdmin en el test.
- **getUser() cacheada**: el header la llama en el mismo request; se reutiliza
  en la ficha para no duplicar llamadas a GoTrue.

## Archivos a crear/modificar

### Nuevos
1. `supabase/migrations/<ts>_create_usuario_serie.sql` — Migración M11
2. `lib/follows.ts` — Servicios inyectables
3. `lib/follows-actions.ts` — Server Actions ("use server")
4. `components/follow-button.tsx` — Componente cliente con botón
5. `app/perfil/seguidas/page.tsx` — Página RSC protegida
6. `tests/lib/follows.test.ts` — Tests de servicios
7. `tests/db/follows-rls.test.ts` — Tests de invariantes + RLS
8. `e2e/follows.spec.ts` — Test E2E Playwright

### Modificar
1. `app/series/[slug]/page.tsx` — Añadir <FollowButton /> en la ficha
2. `app/perfil/page.tsx` — Añadir link "Ver mis series seguidas"
3. `types/database.ts` — Regenerado con gen:types (incluye usuario_serie)

## Servicios en `lib/follows.ts`

```typescript
// Tipos de retorno
interface SerieSeguida {
  created_at: string
  serie: { titulo: string; slug: string; portada_url: string | null }
}

// Servicios (inyectables, reciben AuthClient o userId)
export async function seguirSerie(client: AuthClient, userId: string, serieId: string): Promise<void>
export async function dejarDeSeguirSerie(client: AuthClient, userId: string, serieId: string): Promise<void>
export async function estaSiguiendo(client: AuthClient, userId: string, serieId: string): Promise<boolean>
export async function listMisSeguidas(client: AuthClient, userId: string): Promise<SerieSeguida[]>
```

### Detalles de consultas

**seguirSerie**: insert { usuario_id: userId, serie_id: serieId }. Si falla
con 23505 (UNIQUE violado) → silencioso (idempotente, FOL-08).

**dejarDeSeguirSerie**: delete por usuario_id + serieId. Idempotente (0 filas
borradas no es error).

**estaSiguiendo**: select count(*) por usuario_id + serieId → boolean.

**listMisSeguidas**: select de usuario_serie → join serie (titulo, slug,
portada_url), order by created_at desc.

## Página `app/perfil/seguidas/page.tsx`

```typescript
export const dynamic = "force-dynamic"

export default async function SeguidasPage() {
  const user = await requireUser({ next: "/perfil/seguidas" })
  const client = await createAuthClient()
  const seguidas = await listMisSeguidas(client, user.id)

  // Grid de tarjetas: portada (o placeholder), título, link a /series/<slug>
  // EmptyState si seguidas.length === 0
}
```

## Componente `components/follow-button.tsx`

- **Client Component** ("use client")
- Props: `serieId: string`, `serieSlug: string`, `siguiendoInicial: boolean`
- Estado: `siguiendo` (bool), `pending` (useTransition)
- Render: botón con texto "Seguir" / "Siguiendo" según estado
- Click: alterna estado (optimista) + llama a accionSeguir/accionDejarDeSeguir
- Sin sesión: componente no se renderiza (se controla desde la ficha)

## Integración en `app/series/[slug]/page.tsx`

- Obtener `siguiendo` con `estaSiguiendo(client, user.id, serie.id)` solo si
  `user !== null` (con sesión).
- Renderizar `<FollowButton serieId={serie.id} serieSlug={serie.slug}
  siguiendoInicial={siguiendo} />` solo si `user !== null` (FOL-06).
- Posición: en la cabecera, junto al rating o debajo del título.

## Integración en `app/perfil/page.tsx`

Añadir en la sección "Datos de la cuenta", junto a "Ver mi actividad":
```tsx
<Link href="/perfil/seguidas" className="text-brand underline-offset-2 hover:underline">
  Ver mis series seguidas
</Link>
```

## Tests

### `tests/db/follows-rls.test.ts` — Invariantes + RLS
- Fixture: 2 usuarios (owner, ajeno), 2 series aprobadas.
- Invariantes:
  - Seguir crea fila con usuario_id + serie_id + created_at.
  - Duplicado (misma serie) → 23505 (UNIQUE).
  - Dejar de seguir borra la fila.
  - Cascade: borrar serie → follow borrado.
- RLS:
  - Owner lee sus follows (ok).
  - Ajeno no ve follows del owner (0 filas).
  - Anon no puede insert (denegado).
  - Owner inserta su follow (ok).
  - Ajeno no inserta follow con usuario_id del owner (denegado por RLS).
  - Owner borra su follow (ok).
  - Ajeno no borra follow del owner (denegado).

### `tests/lib/follows.test.ts` — Servicios
- Fixture: usuario + serie aprobada.
- seguirSerie: crea follow → estaSiguiendo true.
- seguirSerie duplicado: 23505 → silencioso (no lanza).
- dejarDeSeguirSerie: borra follow → estaSiguiendo false.
- dejarDeSeguirSerie inexistente: idempotente (no lanza).
- estaSiguiendo: true/false según estado.
- listMisSeguidas: orden desc, join serie (titulo, slug, portada_url).

### `e2e/follows.spec.ts` — E2E Playwright
- createAuthUserWithUsuario + seed de serie aprobada.
- Login → ficha de serie → click "Seguir" → botón cambia a "Siguiendo".
- Navegar a /perfil/seguidas → serie visible con título y link.
- Volver a ficha → click "Siguiendo" → botón cambia a "Seguir".
- Volver a /perfil/seguidas → serie ya no visible.
- Sin sesión en /perfil/seguidas → redirect a /login.

## Riesgos técnicos

1. **RLS de usuario_serie**: las policies usan `usuario_id = auth.uid()` directo
   (no subquery a padre como lista_serie). Más simple que F013 porque
   usuario_serie tiene usuario_id propio. Cubierto por tests RLS en T1.

2. **Estado inicial del botón en ficha**: estaSiguiendo se llama solo si hay
   sesión (user !== null). Sin sesión, el componente no se renderiza (FOL-06).
   La ficha ya llama getUser() cacheada en el header; se reutiliza.

3. **Revalidación acotada**: revalidatePath('/series/<slug>') +
   revalidatePath('/perfil/seguidas') en lugar de revalidatePath('/', 'layout').
   Más eficiente: solo invalida las rutas afectadas. Si se añaden más rutas
   futuras, considerar revalidatePath('/', 'layout').

4. **23505 en seguirSerie**: el UNIQUE violado se captura y se ignora
   (idempotente). El cliente recibe { ok: true } en ambos casos (creado o
   ya existía).

5. **Cascade borrar usuario**: borrar usuario en GoTrue → cascade borra
   todos sus follows. Correcto por FK ON DELETE CASCADE.

6. **Tests E2E con workers=1**: follows.spec.ts corre en orden alfabético;
   su cleanup (deleteAuthUser → cascade) restaura el fixture. No afecta a
   otros specs existentes.

## Qué NO haré (fuera de alcance)
- Notificaciones de nuevos episodios (follow-up F019)
- Categorías de seguimiento (favoritas, viendo, completada, pendiente)
- Notas personales en el follow
- Recomendaciones basadas en follows
- Exportar/importar follows
- Perfiles públicos de follows de otros usuarios
- Paginación en /perfil/seguidas (catálogo personal pequeño por diseño)
- Contador de seguidores en la ficha (follow-up si se necesitan perfiles públicos)
