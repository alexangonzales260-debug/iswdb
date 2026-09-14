# 027 — Likes en reseñas · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Migración M21 con tabla reseña_like: reseña_id FK reseña cascade,
   user_id FK usuario cascade, created_at. UNIQUE(reseña_id, user_id).
   RLS: select público (cualquiera ve contadores), insert/delete own
   (user_id = auth.uid()). Sin update.
2. UI: botón "Útil" con icono ThumbsUp + contador en cada reseña, en
   components/reseñas-section.tsx (ficha) y en /resenas/<id>. Toggle
   like/unlike con estado inicial. Sin sesión: contador visible, botón
   deshabilitado.
3. Conteo en lecturas existentes: listReseñasSerie y getReseña devuelven
   numLikes y yaDisteLike (si hay sesión).
4. Alcance: toggle simple + contador. Sin notificaciones de likes, sin
   ordenar por likes, sin downvote.
5. Auto-like permitido (el autor puede dar like a su propia reseña). UNIQUE
   previene duplicados.
6. MIGRACIÓN M21 APROBADA EXPLÍCITAMENTE (CONSTRAINTS).

## Verificación previa del esquema (hallazgos)
- Última migración M20 (20260908120000_alter_notificacion_comentarios.sql).
  Etiqueta libre: **M21**. Timestamp debe ser posterior a
  20260908120000 → `20260910120000_create_resena_like.sql`.
- DECISIONS.md termina en D32 → F027 cierra con **D33**. ROADMAP: 026
  último → 027 ✅.
- La tabla reseña (M5) ya tiene PK uuid, user_id, serie_id, UNIQUE.
  reseña_like referencia reseña(id) y usuario(id) con CASCADE. Sin
  trigger: no hay updated_at que refrescar.
- RLS reseña_select_public (using true, anon+authenticated) es el
  patrón a seguir. reseña_like_select_public usa el mismo patrón.
- reseña_like es la primera tabla con select público de.likes (las
  tablas de follows como usuario_serie usan select own). Aquí el
  select público es necesario para que cualquier usuario (anon) vea el
  conteo de likes.
- listReseñasSerie usa createServiceRoleClient (embed usuario.email
  oculto para anon). numLikes se calcula con likesPorReseñas usando
  el mismo service-role client. yaDisteLike usa likesPropios con un
  cliente de sesión (si userId está presente) o service-role.
- getReseña (F025) ya usa createServiceRoleClient. Mismo patrón para
  numLikes/yaDisteLike.
- components/reseñas-section.tsx es RSC; el botón LikeButton es
  "use client" (patrón FollowButton/F018). Se le pasan numLikes e
  yaDisteLike como props desde el RSC padre.
- app/resenas/[id]/page.tsx es RSC force-dynamic; misma integración.
- Tests DB/RLS: patrón follows-rls.test.ts / comentarios-rls.test.ts
  (beforeAll con usuarios, series, reseñas; afterAll cleanup). Tests
  de servicio: patrón reseñas.test.ts (clientes con sesión, dbAdmin
  como service-role).
- E2E: patrón follows.spec.ts (flujo completo en un solo test por
  cookies de sesión). wipe() en global-setup.ts debe borrar reseña_like
  ANTES de reseña (FK cascade).
- Seguir/Follow (D24): idempotencia 23505 silenciada, revalidPath
  acotado. Mismo patrón para likes.

## Decisiones técnicas (justificadas)

### 1. Migración M21 (`20260910120000_create_resena_like.sql`)
```sql
-- M21: tabla reseña_like (F027) + RLS
-- Likes de usuarios en reseñas ("Útil"). FK cascade en ambas
-- direcciones (borrar la reseña o el usuario borra sus likes). Sin
-- updated_at: toggle no necesita refresco. UNIQUE(reseña_id, user_id)
-- previene duplicados (LIKE-05). Auto-like permitido.

create table public."reseña_like" (
  "reseña_id" uuid not null references public."reseña" (id) on delete cascade,
  user_id uuid not null references public.usuario (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique ("reseña_id", user_id)
);

-- Conteo de likes por reseña (ORDER BY numLikes DESC en futuros usos).
create index "reseña_like_resena_idx" on public."reseña_like" ("reseña_id");
-- Likes propios del usuario (yaDisteLike).
create index "reseña_like_user_idx" on public."reseña_like" (user_id);

alter table public."reseña_like" enable row level security;

-- Lectura pública (LIKE-04): qualquer pessoa (anon) ve el conteo.
create policy "reseña_like_select_public" on public."reseña_like"
  for select to anon, authenticated using (true);
-- Escritura own (LIKE-01/LIKE-02): solo la fila propia.
create policy "reseña_like_insert_own" on public."reseña_like"
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "reseña_like_delete_own" on public."reseña_like"
  for delete to authenticated
  using (user_id = auth.uid());

-- Grants patrón M2: select público; insert/delete solo authenticated + service_role.
grant select on table public."reseña_like" to anon, authenticated, service_role;
grant insert, delete on table public."reseña_like" to authenticated, service_role;
```
Notas:
- Sin trigger (no hay updated_at, no hay contadores materializados).
- Sin id uuid PK: la tabla es una relación many-to-many; el UNIQUE es
  la clave natural y compuesta.
- Tras aplicar: `supabase db reset` + `npm run gen:types`.
- reseña_select_public (M5) ya deja leer la reseña → el RLS de
  reseña_like no necesita verificar que la reseña sea pública (el
  select está en la tabla like, no en reseña).

### 2. Servicios inyectables (lib/likes.ts, nuevo)
Patrón F012/F024/F018. Las funciones reciben `AuthClient` por
parámetro (las Server Actions pasan `createAuthClient()`; los tests,
clientes planos con sesión en memoria o `dbAdmin` como service-role).
- `darLike(client, reseñaId, userId)`: insert en reseña_like. Si
  23505 (UNIQUE) → idempotente, no error (patrón D24 seguirSerie).
- `quitarLike(client, reseñaId, userId)`: delete por reseña_id +
  user_id. Idempotente (0 filas no es error).
- `likesPorReseñas(clientServiceRole, reseñaIds: string[])`:
  `Map<string, number>` reseñaId → count. Select reseña_id con
  group by reseña_id, filtrado por in(reseñaIds). Requiere
  service-role porque el RLS select_public de reseña_like es
  suficiente para leer (cualquier persona ve el conteo), pero el
  group by no necesita service-role — se puede hacer con el anon
  client también. Sin embargo, por consistencia con listReseñasSerie
  (que ya usa service-role), se usa el mismo cliente.
- `likesPropios(client, reseñaIds: string[], userId)`:
  `Set<string>` de reseñaIds donde el usuario tiene like. Select
  reseña_id filtrado por user_id e in(reseñaIds). Si userId es null
  → Set vacío.

### 3. Integración en lib/reseñas.ts
- `listReseñasSerie(clientServiceRole, serieId, userId?)`:
  parámetro opcional. Después de obtener las reseñas, llama a
  `likesPorReseñas` y `likesPropios` (si userId) en paralelo. Cada
  reseña gana `numLikes` y `yaDisteLike`.
- `getReseña(clientServiceRole, reseñaId, userId?)`: mismo patrón,
  para una sola reseña.
- `ReseñaPublica` y `ReseñaDetalle` se extienden con `numLikes:
  number` y `yaDisteLike: boolean`.
- **Sin N+1**: likesPorReseñas recibe el array de ids y hace un solo
  query con `in(reseñaIds)` + group by.

### 4. Server Actions (lib/likes-actions.ts, nuevo)
Patrón follows-actions.ts (requireUser → createAuthClient → servicio
→ revalidatePath; fallo → `{ error }`):
- `accionToggleLike(reseñaId, serieSlug, reseñaPageId?, prev,
  formData)` o dos actions separadas `accionDarLike` /
  `accionQuitarLike`. Se usa un solo `accionToggleLike` con
  useTransition en el componente (igual que FollowButton con su
  `alternar()`). La action recibe `accion` ('dar' | 'quitar') como
  campo del formData.
- `requireUser({ next: /resenas/<id> o /series/<slug>, message:
  'Inicia sesión para votar' })` → user.id.
- `revalidatePath`: `/resenas/${reseñaPageId}` si existe (página de
  reseña individual) + `/series/${serieSlug}` (ficha). Ambas rutas
  se revalidan porque el like puede ocurrir desde cualquiera de las
  dos vistas.

### 5. Componente cliente (components/like-button.tsx)
Patrón FollowButton (F018): "use client", useState + useTransition.
- Props: `{ reseñaId, numLikesInicial, yaDisteLikeInicial, serieSlug }`.
- Estado local: `numLikes` (number), `yaDisteLike` (boolean).
- Toggle: optimistic update (flip yaDisteLike ± 1 numLikes) →
  startTransition con la action → si error → revert.
- Sin sesión (props `conSesion: false` o numLikesInicial provided
  pero el componente sabe que no hay sesión): botón disabled con
  `title="Inicia sesión para votar"`. El contador sigue visible.
- Icono: ThumbsUp de lucide-react (ya instalado, patrón
  MessageSquareText en reseñas-section).
- El botón es un `<Button>` de shadcn (ya disponible, patrón
  FollowButton).

### 6. Integración en UI
- `components/reseñas-section.tsx` (RSC): después de llamar a
  listReseñasSerie (que ahora incluye numLikes/yaDisteLike), pasa
  los valores a LikeButton por cada reseña. El userId del usuario
  actual se obtiene de `getUser()` (ya se llama).
- `app/resenas/[id]/page.tsx` (RSC force-dynamic): getReseña
  incluye numLikes/yaDisteLike. Se pasa a LikeButton. El userId se
  obtiene de `getUser()` (ya se llama).

### 7. global-setup.ts (wipe E2E)
Añadir `await unwrap(db.from('reseña_like').delete().not('reseña_id', 'is', null))`
ANTES del delete de reseña (FK cascade: borrar reseña cascada sus
likes).

### 8. E2E (e2e/likes-resenas.spec.ts)
- Setup: usuario A (createAuthUserWithUsuario) crea reseña pública
  en e2e-01 vía service-role. B (createAuthUserWithUsuario) inicia
  sesión.
- Flujos:
  1. Sin sesión: contador visible (0) y botón deshabilitado.
  2. B da like → contador 1, botón activo.
  3. B quita like → contador 0, botón inactivo.
  4. A da like a su propia reseña → contador 1 (auto-like).
  5. Doble click rápido no duplica (UNIQUE idempotente).
- Cleanup: cascade por deleteAuthUser (auth.users → usuario →
  reseña_like → reseña).

### 9. ADR de cierre
D33 en DECISIONS.md: tabla reseña_like (M21) con RLS select público /
insert+delete own sin update; likes como servicio inyectable;
numLikes/yaDisteLike en listReseñasSerie y getReseña con parámetro
opcional userId; yaDisteLike siempre boolean (false sin userId);
auto-like permitido; sin notificaciones, sin orden por likes, sin
downvote.

## Archivos
**Crear**
- spec/features/027-likes-resenas/{spec.md,plan.md,tasks.md}
- supabase/migrations/20260910120000_create_resena_like.sql (M21)
- lib/likes.ts · lib/likes-actions.ts
- components/like-button.tsx
- tests/db/likes-rls.test.ts · tests/lib/likes.test.ts
- e2e/likes-resenas.spec.ts

**Modificar**
- lib/reseñas.ts (listReseñasSerie y getReseña: numLikes + yaDisteLike)
- components/reseñas-section.tsx (renderizar LikeButton)
- app/resenas/[id]/page.tsx (renderizar LikeButton)
- e2e/global-setup.ts (wipe de reseña_like antes de reseña)
- types/database.ts (gen:types)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md

## Riesgos técnicos
- **Select público de reseña_like vs conteos**: el RLS
  reseña_like_select_public (using true) deja que anon lea todas las
  filas. Para un catálogo pequeño (≤100 series, ≤1000 reseñas) es
  aceptable (D16). Si escala, se materializa un contador o se cambia
  a una función RPC con filtro.
- **Integración de numLikes/yaDisteLike sin N+1**: likesPorReseñas
  usa un solo query con `in(reseñaIds)` + group by. Para la ficha de
  serie (≤20 reseñas por página) es eficiente.
- **Toggle optimista con revert**: si la action falla (sesión expirada,
  error de red), el componente revierte el estado local. Patrón ya
  probado en FollowButton.
- **Revalidación de dos rutas**: el like puede ocurrir desde la ficha
  (/series/<slug>) o desde la página de reseña (/resenas/<id>). La
  action revalida ambas para que el contador se actualice
  independientemente de la vista de origen.
- **FK cascade**: borrar una reseña cascada sus likes; borrar un
  usuario cascada sus likes. Sin huérfanas. Tested en T1.

## Qué NO haré (fuera de alcance)
- Notificaciones de likes en tus reseñas
- Ordenar reseñas por likes
- Downvote / "no útil"
- Conteo de likes recibidos en el perfil público
- Likes en comentarios (solo reseñas)
- Contador de likes en la ficha de serie (fuera de la sección reseñas)
- Animaciones o sonidos en el toggle
- Optimistic update con delay artificial para testing
- Commits sin tu orden · tag F27 sin orden explícita
