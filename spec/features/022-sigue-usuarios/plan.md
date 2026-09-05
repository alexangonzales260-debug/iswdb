# Plan técnico — Feature 022: Seguir a usuarios + feed

## Decisiones aprobadas (por el usuario)
1. Migración M15 con tabla `usuario_usuario`: `seguidor_id` FK usuario cascade,
   `seguido_id` FK usuario cascade, `created_at`, `UNIQUE(seguidor_id,
   seguido_id)`, `CHECK (seguidor_id != seguido_id)`. RLS: select/insert/delete
   own (`seguidor_id = auth.uid()`); contadores cross-user vía service_role
   (patrón D25/D27).
2. Botón "Seguir/Siguiendo" en `/usuarios/<username>`, visible solo con sesión
   y NO en el propio perfil. Contadores "Seguidos / Seguidores" en la cabecera
   del perfil público (visibles siempre, SEG-04).
3. Página `/feed` (protegida, requiere sesión): actividad de usuarios seguidos
   (reseñas públicas, listas públicas, valoraciones) en orden cronológico
   desc. Link "Feed" en el header visible solo con sesión.
4. Alcance: follow/unfollow + feed cronológico simple. Sin notificaciones de
   nuevos seguidores, sin bloqueo de usuarios, sin algoritmo en el feed.
5. MIGRACIÓN M15 APROBADA EXPLÍCITAMENTE (CONSTRAINTS).

## Verificación previa de RLS y lecturas (hallazgos)
`usuario_usuario` es tabla nueva: no hay policies previas. Se sigue el patrón
M11 (`usuario_serie`, F018) para grants/policies, con la salvedad de que aquí
NO existe `update` (un follow solo se crea y se borra).

| Tabla/lectura | RLS actual | Opción para F022 |
|---------------|------------|------------------|
| `usuario_usuario` (nuevo, M15) | Sin RLS aún → se crea own (`seguidor_id = auth.uid()`) | Select/insert/delete own; grants patrón M2 (service_role fuera del RLS) |
| `public.usuario` (target/autores) | M7 solo-propio + sin grant anon (M2) | Lectura cross-user con `createServiceRoleClient()` (D25/D27), **sin tocar RLS** |
| `valoracion` / `reseña` | Lectura pública (D11/D18) | En el feed se leen con service_role + filtro explícito `serie.moderation_status = 'aprobada'` (patrón F021) |
| `lista` | `lista_select_own_or_public` (M9) | Feed: `es_publica = true` explícito (patrón `listMisListas`) |

**Conclusión 1 — RLS own de `usuario_usuario`.** Las policies de lectura/
escritura propias (`auth.uid()`) bloquean cualquier lectura cross-user de
follows. Los contadores (`Seguidos/Seguidores`) y el feed de otro usuario son
lecturas cross-user → van con `createServiceRoleClient()` server-side (D25),
igual que F021 y `seguidoresPorSerie` (D26). No se amplía RLS.

**Conclusión 2 — el target id no sale de `getPerfilPublico`.** F021 descarta
deliberadamente el `id` del retorno (ver plan F021 §5). F022 necesita el
`seguido_id` (FK) y comparar `user.id` para ocultar el botón en el propio
perfil. En vez de modificar `getPerfilPublico` (y sus tests F021), F022 añade
un servicio propio: `getUsuarioIdPorUsername(clientServiceRole, username)`
(lookup service_role, una lectura extra barata por request). F021 queda
intacto.

**Conclusión 3 — feed heterogéneo ordenado en servidor.** Las tres fuentes
(valoraciones, reseñas públicas, listas públicas) se leen con service_role,
se funden en TS y se ordenan por `created_at` desc (D16: catálogo pequeño,
sin materialización). Las listas usan su `created_at` (el item del feed es
"creó lista", no "editó lista"): M9 ya tiene columna `created_at`.

## Decisiones técnicas

### 1. Migración M15 (`20260905…_create_usuario_usuario.sql`)
```sql
-- M15: tabla usuario_usuario (F022) + RLS
-- Seguir usuarios. SEG-08 (CHECK anti-autofollow), SEG-09 (UNIQUE),
-- SEG-10 (RLS own). Grants patrón M2/M11: service_role queda fuera del RLS
-- para contadores/feed cross-user server-side (D25).

create table public.usuario_usuario (
  seguidor_id uuid not null references public.usuario (id) on delete cascade,
  seguido_id uuid not null references public.usuario (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (seguidor_id, seguido_id),
  check (seguidor_id <> seguido_id)
);

-- "Seguidos" de un usuario (contador + feed): filtrado por seguidor_id.
create index usuario_usuario_seguidor_idx on public.usuario_usuario (seguidor_id);
-- "Seguidores" de un usuario (contador): filtrado por seguido_id.
create index usuario_usuario_seguido_idx on public.usuario_usuario (seguido_id);

alter table public.usuario_usuario enable row level security;

-- RLS own: un usuario solo gestiona follows donde ÉL es el seguidor (SEG-10).
create policy usuario_usuario_select_own on public.usuario_usuario
  for select to anon, authenticated
  using (seguidor_id = auth.uid());
create policy usuario_usuario_insert_own on public.usuario_usuario
  for insert to authenticated
  with check (seguidor_id = auth.uid());
create policy usuario_usuario_delete_own on public.usuario_usuario
  for delete to authenticated
  using (seguidor_id = auth.uid());

grant select on table public.usuario_usuario to anon, authenticated, service_role;
grant insert, delete on table public.usuario_usuario to authenticated, service_role;
```
Al terminar: `npm run gen:types`.

### 2. `lib/sigue-usuarios.ts` (nuevo, servicios inyectables)
Patrón `lib/follows.ts` / `lib/valoraciones.ts`: los servicios reciben el
cliente por parámetro (Server Actions → `createAuthClient()`; tests → clientes
planos; lecturas cross-user → `createServiceRoleClient()`).

```ts
export const ERRORES_SIGUE = {
  sinSesion: 'Debes iniciar sesión para seguir a otros usuarios',
  noPuedeSeguirse: 'No puedes seguirte a ti mismo',
  destinoNoEncontrado: 'El usuario que quieres seguir no existe'
} as const
```

- `seguirUsuario(client, seguidorId, seguidoId)` — SEG-01. Rechazo app-side de
  autofollow (`seguidorId === seguidoId` → `noPuedeSeguirse`, mensaje amigable;
  el CHECK 23514 queda de backstop). `23503` → `destinoNoEncontrado`. `23505`
  se trata como éxito idempotente (doble click / carrera; patrón D24,
  `seguirSerie`). RLS insert_own garantiza el alcance.
- `dejarDeSeguirUsuario(client, seguidorId, seguidoId)` — SEG-02. Idempotente
  (0 filas borradas no es error).
- `estaSiguiendoUsuario(client, seguidorId, seguidoId): Promise<boolean>` —
  SEG-03; `maybeSingle` con cliente de sesión (RLS own).
- `contadoresUsuario(clientServiceRole, userId): Promise<{ seguidos; seguidores }>` —
  SEG-04. Dos conteos sobre `usuario_usuario` con service_role (RLS own no
  permite ver follows ajenos; D25): `seguidos = count(seguidor_id = userId)`,
  `seguidores = count(seguido_id = userId)`.
- `getUsuarioIdPorUsername(clientServiceRole, username): Promise<string | null>` —
  lookup del target id (service_role; ver hallazgo 2). Permite cumplir la FK,
  el `esPropio` y `estaSiguiendoUsuario` sin tocar F021.
- `listFeed(clientServiceRole, seguidorId, limit = 50): Promise<ItemFeed[]>` —
  SEG-06:
  1. Follows del usuario: `usuario_usuario.select('seguido_id').eq('seguidor_id', seguidorId)`.
     Sin follows → `[]`.
  2. Autores: `usuario.select('id, username').in('id', ids)` (service_role) →
     mapa id → username.
  3. Tres lecturas en paralelo (por fuente `.limit(limit)` como cota defensiva):
     - valoraciones: embed `serie!inner ( titulo, slug, moderation_status )`,
       filtro `serie.moderation_status = 'aprobada'`.
     - reseñas públicas: mismo embed + filtro aprobada.
     - listas: `es_publica = true` (id, nombre, user_id, created_at).
  4. Fusión en un union `ItemFeed` (discriminated union `tipo:
     'valoracion' | 'resena' | 'lista'` con `creadoEn`, `autor{id, username}`
     y payload) → orden `created_at` desc → `slice(0, limit)`.

Tipos del union:
```ts
export type ItemFeed =
  | { tipo: 'valoracion'; creadoEn: string; autor: { id: string; username: string };
      serie: { titulo: string; slug: string }; nota: number }
  | { tipo: 'resena'; id: string; creadoEn: string; autor: { id: string; username: string };
      serie: { titulo: string; slug: string }; contenido: string }
  | { tipo: 'lista'; creadoEn: string; autor: { id: string; username: string };
      lista: { id: string; nombre: string } }
```

### 3. `lib/sigue-usuarios-actions.ts` + botón + cabecera del perfil
- `lib/sigue-usuarios-actions.ts` ('use server'): `accionSeguirUsuario` y
  `accionDejarDeSeguirUsuario` (estado `{ error?: string }`). Extraen
  `seguidoId` y `seguidoUsername` del FormData; `requireUser({
  next: '/usuarios/<username>' })`; `createAuthClient()`; llaman al servicio;
  `revalidatePath(/usuarios/<username>)` + `revalidatePath('/feed')`. Patrón
  `follows-actions.ts`.
- `components/seguir-usuario-button.tsx` ('use client', clon de
  follow-button.tsx): props `{ seguidoId, seguidoUsername, siguiendoInicial }`.
  Toggle optimista "Seguir" ↔ "Siguiendo" (SEG-01/02/03), revert + `role=alert`
  si la action devuelve error.
- `app/usuarios/[username]/page.tsx` (RSC, ya force-dynamic):
  - Tras `getPerfilPublico` (y `notFound()` si null), si hay perfil:
    `const serviceRole = createServiceRoleClient()`;
    `targetId = await getUsuarioIdPorUsername(serviceRole, perfil.usuario.username)`;
    `contadores = await contadoresUsuario(serviceRole, targetId)`;
    `siguiendo = user ? await estaSiguiendoUsuario(await createAuthClient(), user.id, targetId) : false`;
    `esPropio = user !== null && user.id === targetId`.
  - Cabecera: fila `Seguidos N · Seguidores N` (siempre visible, SEG-04) +
    `SeguirUsuarioButton` SOLO si `user && !esPropio` (SEG-05). Sin sesión ni
    en el propio perfil no se renderiza el botón.
  - `getUser()` (lib/auth) para la sesión opcional (la página sigue siendo
    pública: en ningún caso se llama a `requireUser`).

### 4. `/feed` + link en el header
- `app/feed/page.tsx` (nuevo, RSC, `force-dynamic`): `requireUser({ next:
  '/feed' })` (SEG-07 / AUTH-06); `listFeed(createServiceRoleClient(), user.id)`;
  render por `tipo` con icono lucide (`Star` valoración, `MessageSquareText`
  reseña, `List` lista): "Valoró `<serie>` con N/10", "Reseñó `<serie>`",
  "Creó la lista `<lista>`" + link al target (`/series/<slug>` o
  `/listas/<id>`) + autor como link a `/usuarios/<username>`. Empty state si
  no sigue a nadie / sin actividad.
- `components/header.tsx`: en el bloque `user ? …`, añadir link "Feed" →
  `/feed` (solo con sesión, tras el link de /perfil).

## Archivos a crear/modificar

### Nuevos
1. `supabase/migrations/<ts>_create_usuario_usuario.sql` — M15.
2. `lib/sigue-usuarios.ts` — servicios + tipos (`ItemFeed`, `ERRORES_SIGUE`).
3. `lib/sigue-usuarios-actions.ts` — `accionSeguirUsuario`,
   `accionDejarDeSeguirUsuario`.
4. `components/seguir-usuario-button.tsx` — botón optimista.
5. `app/feed/page.tsx` — feed protegido (RSC, force-dynamic).
6. `tests/db/sigue-usuarios-rls.test.ts` — invariantes + RLS de M15.
7. `tests/lib/sigue-usuarios.test.ts` — servicios y feed (fixture patrón
   tests/lib/perfil-publico.test.ts).
8. `e2e/sigue-usuarios.spec.ts` — flujo completo.

### Modificar
1. `app/usuarios/[username]/page.tsx` — contadores + botón (`esPropio`).
2. `components/header.tsx` — link "Feed" con sesión.
3. `e2e/global-setup.ts` — `wipe()` borra también `usuario_usuario`
   (limpieza defensiva de residuos si una corrida E2E muere).
4. `types/database.ts` — regenerado (`npm run gen:types`).
5. `ROADMAP.md` — 022 ✅ (cierre T6).
6. `DECISIONS.md` — D28 (cierre T6).
7. `docs/memory/session-log.md` — sesión F022 (cierre T6).

## Riesgos técnicos

| Riesgo | Mitigación |
|--------|------------|
| RLS own de `usuario_usuario` bloquea contadores y feed (lectura cross-user) | service_role server-side (D25/D27), patrón F021/D26; los servicios `contadoresUsuario`/`listFeed` reciben el client service-role por parámetro |
| Feed con 3 fuentes heterogéneas y orden cronológico | Lecturas paralelas con `serie!inner` + filtro aprobada (F021); fusión en TS con `created_at` desc y cota por fuente (`limit`) + `slice`; test de orden explícito con created_at distintos |
| Botón visible en el propio perfil (o sin sesión) | `esPropio` por comparación de ids (`user.id === targetId`), no por string del username; la cabecera solo renderiza el botón si `user && !esPropio`; test E2E del propio perfil sin botón |
| Revalidación acotada tras follow/unfollow | Las actions revalidan SOLO `/usuarios/<username>` (contadores + botón) y `/feed`; el header no depende del estado de follows → sin revalidación global |
| Conocer el id del target sin tocar F021 | `getUsuarioIdPorUsername` (service_role) en lib/sigue-usuarios.ts; `getPerfilPublico` y sus tests siguen intactos |
| Autofollow/duplicados con mensaje crudo de Postgres | Rechazo app-side (`noPuedeSeguirse`) + idempotencia en 23505; CHECK/UNIQUE quedan de backstop y se testean en crudo (23514/23505) en tests/db |
| Residuos de `usuario_usuario` en E2E si falla una corrida | `wipe()` de global-setup borra `usuario_usuario`; además los usuarios E2E se borran por cascada (deleteAuthUserByEmail) |

## Qué NO harás (fuera de alcance)
- Notificaciones de nuevos seguidores
- Bloqueo de usuarios
- Algoritmo en el feed (solo cronológico)
- Lista pública de seguidores/seguidos en el perfil (solo contadores)
- Feed global sin follows / paginación del feed (limit fijo, follow-up)
- Mute / silenciar usuarios
- Cambios al RLS existente (M7/M11/M9 y reseña/valoración intactos; solo la
  tabla nueva `usuario_usuario`)
- Modificar `getPerfilPublico` ni los tests de F021 (el id del target se
  obtiene con un servicio propio)
- Migraciones fuera de M15 (sin columna `updated_at` en `usuario_usuario`:
  un follow no se edita, solo se crea/borra)
- Commits ni tag: se generan solo con orden explícita