# Plan técnico — 019 Notificaciones

## Confirmación de modelo existente

La tabla `public.episodio` existe (M1: `supabase/migrations/20260826155429_create_catalog_tables.sql`):

```sql
create table public.episodio (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null references public.serie (id) on delete cascade,
  temporada int not null default 1,
  numero int not null,
  titulo text not null,
  video_id text not null,
  created_at timestamptz not null default now(),
  unique (serie_id, temporada, numero),
  unique (serie_id, video_id)
);
```

Las acciones de admin que insertan episodios:
- `lib/admin.ts` → `crearSerie()` (líneas 383-434): bulk insert de episodios vía `client.from('episodio').insert(...)`.
- `lib/admin.ts` → `editarSerie()` (líneas 441-516): upsert/delete de episodios.

`createServiceRoleClient()` existe en `lib/supabase.ts:29` — cliente server-side con `SUPABASE_SERVICE_ROLE_KEY` que bypass RLS.

---

## 1. Migración M12: tabla `notificacion`

**Archivo**: `supabase/migrations/20260904100000_create_notificacion.sql`

```sql
create table public.notificacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuario(id) on delete cascade,
  serie_id uuid not null references public.serie(id) on delete cascade,
  episodio_id uuid not null references public.episodio(id) on delete cascade,
  leida boolean not null default false,
  created_at timestamptz not null default now(),
  unique (usuario_id, episodio_id)
);

create index notificacion_usuario_id_idx on public.notificacion (usuario_id);
create index notificacion_leida_idx on public.notificacion (usuario_id, leida);

-- Grants: select/update a authenticated; insert solo service_role
grant select, update on table public.notificacion to authenticated;
grant insert on table public.notificacion to service_role;

-- RLS
alter table public.notificacion enable row level security;

create policy notificacion_select_own on public.notificacion
  for select to authenticated
  using (usuario_id = auth.uid());

create policy notificacion_update_own on public.notificacion
  for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
```

**Decisiones clave**:
- `UNIQUE(usuario_id, episodio_id)` previene duplicados (NOT-07).
- FK cascade en las 3 relaciones: borrar usuario/serie/episodio elimina notificaciones.
- Índice compuesto `(usuario_id, leida)` optimiza el conteo de no leídas.
- Insert solo `service_role` porque la generación ocurre server-side en la acción de admin.
- RLS select/update solo propio (NOT-08).

---

## 2. `lib/notificaciones.ts` (nuevo)

Servicios inyectables siguiendo el patrón de `lib/follows.ts`:

- **`listMisNotificaciones(client, userId)`**: JOIN con `serie(titulo, slug)` y `episodio(temporada, numero, titulo)`, ORDER BY `created_at DESC`.
- **`marcarLeida(client, userId, notificacionId)`**: UPDATE `leida = true` WHERE `id = ... AND usuario_id = userId`.
- **`marcarTodasLeidas(client, userId)`**: UPDATE `leida = true` WHERE `usuario_id = userId AND leida = false`.
- **`contarNoLeidas(client, userId)`**: SELECT COUNT WHERE `usuario_id = userId AND leida = false`.
- **`notificarNuevoEpisodio(serviceRoleClient, serieId, episodioId)`**: SELECT `usuario_id` FROM `usuario_serie` WHERE `serie_id = serieId`, luego INSERT batch de notificaciones. Usa `createServiceRoleClient()` de `lib/supabase.ts` porque RLS insert lo restringe.

---

## 3. Integración en `lib/admin.ts`

Modificar `crearSerie` (líneas ~383-434): tras insertar episodios exitosamente, para cada episodio nuevo, llamar `notificarNuevoEpisodio` con `createServiceRoleClient()`.

En `editarSerie` (líneas ~441-516): los episodios nuevos (sin `id`) también deben generar notificaciones. Después del upsert, identificar los que fueron insertados (no actualizados) y llamar `notificarNuevoEpisodio` para cada uno.

---

## 4. `components/notificacion-badge.tsx` (nuevo, server component)

Async Server Component que:
1. Llama `getUser()` para verificar sesión.
2. Si no hay sesión, no renderiza nada.
3. Si hay sesión: `contarNoLeidas(client, userId)`.
4. Si count > 0: renderiza badge con número.

Se inserta en `components/header.tsx` al lado del link de perfil.

---

## 5. `app/perfil/notificaciones/page.tsx` (nuevo, RSC)

Siguiendo patrón de `app/perfil/seguidas/page.tsx`:
1. `export const dynamic = "force-dynamic"`
2. `requireUser({ next: "/perfil/notificaciones" })`
3. `createAuthClient()` → `listMisNotificaciones(client, user.id)`
4. Renderiza lista con "Nuevo episodio en <serie>", info de episodio, botón marcar leída.

---

## 6. `components/marcar-leida-button.tsx` (nuevo, client component)

- `'use client'`
- `useTransition` para UX optimista
- `accionMarcarLeida` (server action) que llama `marcarLeida`
- Botón "Marcar como leída" por notificación individual
- Botón "Marcar todas como leídas" en encabezado de la página

---

## 7. Server actions en `lib/notificaciones-actions.ts` (nuevo)

- `'use server'`
- `accionMarcarLeida(prevState, formData)`: extrae notificacionId, llama `marcarLeida`, revalida paths.
- `accionMarcarTodasLeidas(prevState, formData)`: llama `marcarTodasLeidas`, revalida paths.

---

## 8. Tests de servidor (Vitest)

- Generación al crear episodio: mock admin crea episodio en serie con seguidores → notificaciones existen.
- `listMisNotificaciones`: retorna notificaciones ordenadas.
- `marcarLeida`: leida = true después de marcar.
- `marcarTodasLeidas`: todas leídas = true.
- RLS: usuario A no puede leer notificación de usuario B.
- UNIQUE: insert duplicado usuario+episodio rechazado.

---

## 9. Test E2E (Playwright)

Flujo crítico:
1. Usuario sigue serie.
2. Admin crea episodio en esa serie.
3. Badge aparece en header.
4. Navega a /perfil/notificaciones → ve "Nuevo episodio en <serie>".
5. Marcar leída → badge se actualiza.

---

## Archivos a crear
- `supabase/migrations/20260904100000_create_notificacion.sql`
- `lib/notificaciones.ts`
- `lib/notificaciones-actions.ts`
- `components/notificacion-badge.tsx`
- `components/marcar-leida-button.tsx`
- `app/perfil/notificaciones/page.tsx`

## Archivos a modificar
- `lib/admin.ts` — integrar `notificarNuevoEpisodio` en `crearSerie` y `editarSerie`
- `components/header.tsx` — insertar `NotificacionBadge`

## Riesgos técnicos
1. **RLS insert solo service_role**: la generación de notificaciones usa `createServiceRoleClient()` de `lib/supabase.ts` (bypass RLS).
2. **Header cache/dynamic**: el header es async RSC pero Next.js podría cachearlo. El badge debe renderizar dinámico (verificar patrón existente).
3. **Generación en acción admin no trigger**: es intencional (decidido por el usuario). Si la acción falla parcialmente, las notificaciones de episodios ya insertados no se revierten (aceptado).
4. **UNIQUE usuario+episodio**: si un usuario sigue una serie y el admin crea 2 episodios a la vez, se generan 2 notificaciones (diferentes episodios). El UNIQUE solo previene duplicado exacto.
5. **Performance del header**: contar notificaciones no leídas en cada render del header. Con índice compuesto `(usuario_id, leida)` debería ser rápido.

## Qué NO se hará
- Notificaciones de reseñas, follows, propuestas, valoraciones
- Email/push notifications
- Preferencias de notificación
- Scheduler/cron para detectar nuevos episodios
- Perfiles públicos de notificaciones
- Modificar la tabla `usuario_serie` existente
