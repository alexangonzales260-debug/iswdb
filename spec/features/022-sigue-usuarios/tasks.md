# Tasks — Feature 022: Seguir a usuarios + feed

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Migración M15 (usuario_usuario) + tipos + RLS test
**Estado**: ✅ Completada
**Objetivo**: Tabla de follows entre usuarios con UNIQUE, CHECK anti-autofollow
y RLS own.

**Entregables**:
- `supabase/migrations/<ts>_create_usuario_usuario.sql` (nuevo, M15):
  1. `create table public.usuario_usuario` (`seguidor_id`/`seguido_id` FK
     `public.usuario` cascade, `created_at`, `unique (seguidor_id,
     seguido_id)`, `check (seguidor_id <> seguido_id)`).
  2. Índices `usuario_usuario_seguidor_idx (seguidor_id)` y
     `usuario_usuario_seguido_idx (seguido_id)`.
  3. RLS: `usuario_usuario_select_own` (select a anon, authenticated, `using
     (seguidor_id = auth.uid())`), `usuario_usuario_insert_own` (insert a
     authenticated, `with check (seguidor_id = auth.uid())`),
     `usuario_usuario_delete_own` (delete a authenticated, `using
     (seguidor_id = auth.uid())`).
  4. Grants patrón M2/M11: `select` a anon, authenticated, service_role;
     `insert, delete` a authenticated, service_role.
- `npm run gen:types` (types/database.ts con `usuario_usuario`).
- `tests/db/sigue-usuarios-rls.test.ts` (nuevo, fixture patrón
  tests/db/follows-rls.test.ts):
  - seguir crea fila (seguidor_id, seguido_id, created_at válido).
  - duplicado (seguidor_id, seguido_id) → 23505.
  - seguirse a sí mismo (seguidor_id = seguido_id) → 23514 (CHECK).
  - cascade: borrar el usuario seguido → follow borrado.
  - RLS own: owner inserta/lee/borra sus follows; ajeno ve 0 follows del owner;
    ajeno no inserta con seguidor_id del owner (denegado); ajeno no borra el
    follow del owner (0 filas, el follow persiste); anon no inserta.

**Validación**: `npm test -- --run tests/db/sigue-usuarios-rls.test.ts` verde
(BD local arriba) y `npm run typecheck`.

---

## T2: lib/sigue-usuarios.ts (servicios) + tests de servidor
**Estado**: Pendiente
**Objetivo**: Servicios inyectables de follow/unfollow, contadores y feed.

**Entregables**:
- `lib/sigue-usuarios.ts` (nuevo, patrón lib/follows.ts/valoraciones.ts):
  - `ERRORES_SIGUE`: `sinSesion`, `noPuedeSeguirse`, `destinoNoEncontrado`.
  - `seguirUsuario(client, seguidorId, seguidoId)` — SEG-01; autofollow →
    `noPuedeSeguirse`; `23503` → `destinoNoEncontrado`; `23505` idempotente.
  - `dejarDeSeguirUsuario(client, seguidorId, seguidoId)` — SEG-02, idempotente.
  - `estaSiguiendoUsuario(client, seguidorId, seguidoId): Promise<boolean>`
    — SEG-03 (cliente de sesión, RLS own).
  - `contadoresUsuario(clientServiceRole, userId): Promise<{ seguidos;
    seguidores }>` — SEG-04 (service_role, D25).
  - `getUsuarioIdPorUsername(clientServiceRole, username): Promise<string |
    null>` — lookup del target id sin tocar F021.
  - `listFeed(clientServiceRole, seguidorId, limit = 50): Promise<ItemFeed[]>`
    — SEG-06: follows del seguidor → autores (username) → valoraciones +
    reseñas públicas + listas públicas de los seguidos (filtro
    `serie.moderation_status = 'aprobada'` y `es_publica = true`) en paralelo
    → union `ItemFeed` ordenado `created_at` desc → `slice(0, limit)`.
  - Tipos exportados: `ItemFeed` (discriminated union), `ContadoresUsuario`.
- `tests/lib/sigue-usuarios.test.ts` (nuevo, fixture estilo
  tests/lib/perfil-publico.test.ts): seguir/duplicado idempotente/self/destino
  inexistente · dejar de seguir (idempotente) · estaSiguiendoUsuario true/false
  · contadoresUsuario (`{seguidos, seguidores}`) · listFeed vacío sin follows ·
  union de 3 fuentes ordenadas desc · listas privadas y series no aprobadas
  excluidas · autores con username.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/sigue-usuarios.test.ts` verde.

---

## T3: Actions + botón + contadores en el perfil público
**Estado**: Pendiente
**Objetivo**: Seguir/dejar de seguir desde `/usuarios/<username>` con estado
inicial correcto y contadores visibles.

**Entregables**:
- `lib/sigue-usuarios-actions.ts` (nuevo, patrón follows-actions.ts):
  `accionSeguirUsuario` / `accionDejarDeSeguirUsuario` con `requireUser({ next:
  '/usuarios/<username>' })`, `createAuthClient()`, y
  `revalidatePath('/usuarios/<username>')` + `revalidatePath('/feed')`.
- `components/seguir-usuario-button.tsx` (nuevo, clon de follow-button.tsx):
  props `{ seguidoId, seguidoUsername, siguiendoInicial }`, toggle optimista
  "Seguir" ↔ "Siguiendo" (SEG-01/02/03), revert + `role=alert` en error.
- `app/usuarios/[username]/page.tsx`: tras `getPerfilPublico` (y `notFound()`),
  obtener `targetId` (`getUsuarioIdPorUsername`), `contadores`
  (`contadoresUsuario`), `siguiendo` inicial (`estaSiguiendoUsuario` si hay
  sesión) y `esPropio` (comparación de ids). Cabecera con "Seguidos N ·
  Seguidores N" siempre visible (SEG-04) y `SeguirUsuarioButton` solo con
  `user && !esPropio` (SEG-05). Sin sesión ni en el propio perfil: sin botón.

**Validación**: `npm run lint && npm run typecheck`; prueba manual en
`/usuarios/<username>` con/sin sesión y en el propio perfil.

---

## T4: /feed (RSC protegida) + link "Feed" en el header
**Estado**: Pendiente
**Objetivo**: Feed cronológico de actividad de seguidos.

**Entregables**:
- `app/feed/page.tsx` (nuevo, RSC, `force-dynamic`, `generateMetadata`):
  `requireUser({ next: '/feed' })` (SEG-07/AUTH-06) → `listFeed(
  createServiceRoleClient(), user.id)` → render por `tipo` con iconos lucide:
  "Valoró `<serie>` con `N`/10" (Star), "Reseñó `<serie>`"
  (MessageSquareText), "Creó la lista `<lista>`" (List); link a `/series/<slug>`
  o `/listas/<id>` y autor link a `/usuarios/<username>`. Empty state sin
  follows o sin actividad.
- `components/header.tsx`: en el bloque autenticado, link "Feed" → `/feed`
  (solo con sesión).

**Validación**: `npm run lint && npm run typecheck && npm run build`; revisión
visual de `/feed` con un usuario que sigue a otro con actividad.

---

## T5: E2E Playwright
**Estado**: Pendiente
**Objetivo**: Flujo real seguir → feed → dejar de seguir + guardas.

**Entregables**:
- `e2e/sigue-usuarios.spec.ts` (nuevo):
  - beforeAll: B = `createAuthUserWithUsuario` (username conocido) + actividad
    vía service_role: valoración sobre `slugSerie(1)` (ej. nota 8) y lista
    pública con 1 serie aprobada; A = `createAuthUserWithUsuario`.
  - `FSU flujo completo` (A con sesión vía UI): `/usuarios/<usernameB>` → botón
    "Seguir" → "Siguiendo" + cabecera muestra "Seguidores 1" (contadores
    actualizan) · `/feed` muestra la actividad de B (item "Valoró…" y "Creó la
    lista…") · volver al perfil B → "Siguiendo" → "Seguir" · `/feed` sin la
    actividad de B (empty state) · `/usuarios/<usernameA>` (propio) NO muestra
    botón "Seguir".
  - `FSU-07`: `/feed` sin sesión → redirect `/login?next=%2Ffeed` (AUTH-06).
  - afterAll: `deleteAuthUserByEmail` de A y B (cascade cubre `usuario_usuario`
    en ambas direcciones y la actividad).
- `e2e/global-setup.ts`: `wipe()` borra también `usuario_usuario`.

**Validación**: `npm run test:e2e e2e/sigue-usuarios.spec.ts` verde; sin
regresiones en perfil-publico.spec.ts / follows.spec.ts.

---

## T6: validate.sh + cierre
**Estado**: Pendiente
**Objetivo**: Puerta única y docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 022 ✅.
- `DECISIONS.md`: D28 "Seguir a usuarios (F022): tabla usuario_usuario (M15)
  con FK cascade, UNIQUE(seguidor_id, seguido_id) y CHECK anti-autofollow; RLS
  own (seguidor_id = auth.uid()) y contadores/feed cross-user con service_role
  (D25); feed cronológico desc fusionando valoraciones + reseñas públicas +
  listas públicas en servidor (D16); /feed protegido (AUTH-06); botón solo con
  sesión y no en el propio perfil; sin notificaciones de seguidores, sin
  bloqueo, sin algoritmo".
- `docs/memory/session-log.md`: sesión F022.

**Validación**: `./validate.sh` en verde; Definition of Done completa. (El
commit/tag F22 solo se hace con orden explícita.)

---

## Resumen de archivos

### Nuevos (8)
1. `supabase/migrations/<ts>_create_usuario_usuario.sql`
2. `lib/sigue-usuarios.ts`
3. `lib/sigue-usuarios-actions.ts`
4. `components/seguir-usuario-button.tsx`
5. `app/feed/page.tsx`
6. `tests/db/sigue-usuarios-rls.test.ts`
7. `tests/lib/sigue-usuarios.test.ts`
8. `e2e/sigue-usuarios.spec.ts`

### Modificados (7)
1. `app/usuarios/[username]/page.tsx`
2. `components/header.tsx`
3. `e2e/global-setup.ts` (wipe)
4. `types/database.ts` (gen:types)
5. `ROADMAP.md`
6. `DECISIONS.md`
7. `docs/memory/session-log.md`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Contadores/feed bloqueados por RLS own de usuario_usuario | service_role server-side (D25/D27); servicios con client inyectado |
| Feed de 3 fuentes con orden cronológico | Unión TS + `created_at` desc + cota por fuente; `serie!inner` + filtro aprobada |
| Botón en propio perfil o sin sesión | `esPropio` por ids + render condicional; E2E lo cubre |
| Revalidación acotada | Solo `/usuarios/<username>` y `/feed` en las actions |
| Target id sin tocar F021 | `getUsuarioIdPorUsername` dedicado |
| Mensajes crudos de Postgres (23514/23505) | Errores amigables app-side; constraint como backstop testeado |
| Residuos E2E de usuario_usuario | wipe() ampliado + borrado por cascada |

---

## Fuera de alcance (NO se hace)
- Notificaciones de nuevos seguidores
- Bloqueo de usuarios
- Algoritmo en el feed (solo cronológico)
- Lista pública de seguidores/seguidos (solo contadores)
- Feed global sin follows / paginación del feed
- Mute / silenciar usuarios
- Cambios al RLS existente (M7/M11/M9 intactos; solo M15)
- Modificar `getPerfilPublico` ni tests de F021
- Migraciones distintas de M15