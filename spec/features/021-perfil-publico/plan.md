# Plan técnico — Feature 021: Perfil público

## Decisiones aprobadas (aprobadas por el usuario)
1. Username: columna `username` en `public.usuario` (única, generada por
   defecto del email si no se provee, editable en `/perfil`). URL
   `/usuarios/<username>`.
2. Perfil público muestra solo lo público: reseñas públicas, listas públicas,
   valoraciones (nota visible), series seguidas. Sin email ni datos privados.
3. Todo público por defecto (sin flags de privacidad; follow-up).
4. MIGRACIÓN M14 APROBADA EXPLÍCITAMENTE (CONSTRAINTS): columna username con
   backfill para usuarios existentes.
5. Alcance F021: perfil público + username editable. Sin seguir usuarios
   (eso es F022).

## Verificación previa de RLS (hallazgos)
Verificados los policies y grants **actuales** de `public.usuario` y
`public.usuario_serie`:

| Tabla | Grants (M2/M11) | Policy SELECT |
|-------|-----------------|---------------|
| `public.usuario` | SELECT solo `authenticated`, `service_role` (M2). **anon sin grant** | `usuario_select_own`: `id = auth.uid() or is_admin_or_mod()` (M7) |
| `public.usuario_serie` | SELECT `anon`, `authenticated`, `service_role` (M11) | `usuario_serie_select_own`: `usuario_id = auth.uid()` (M11) |

**Conclusión 1 — `public.usuario` NO expone email a anon.** El grant SELECT
de anon no existe (M2) y el policy (M7) es solo-propio: ni anon ni un
autenticado ajeno pueden leer `usuario.email` (u otros campos) de terceros.
No hay fuga que corregir.

**Conclusión 2 — el select de `public.usuario` es solo-propio → lectura
cross-user vía service_role (patrón D25), sin ampliar RLS.** El perfil público
necesita leer `username`, `display_name` y `created_at` de OTRO usuario. M7
nació precisamente para no exponer la fila ajena; la única consumidora de
esos datos es la página `/usuarios/<username>` (server-side). Se usa
`createServiceRoleClient()` (lib/supabase.ts) para esa lectura y para las de
`usuario_serie` ajenas. **No se crea policy pública ni view sobre `usuario`**
(UI a la letra de la decisión 2 y de M7).

**Conclusión 3 — `usuario_serie` es select-own (M11).** Las series seguidas
de OTRO usuario se leen con service_role (D25/D26; el mismo patrón de
`seguidoresPorSerie` en lib/recomendaciones.ts, y que M11 ya otorga select a
service_role). No se añade política pública.

**Elección de cliente en `getPerfilPublico`:** como el header (`usuario`) y
las seguidas exigen service_role de todas formas, y valoraciones/reseñas/
listas públicas son igualmente públicas (D11 · reseña_select_public ·
lista_select_own_or_public con `es_publica=true`), toda la página se lee con
un único cliente service_role server-side. Con service_role hay que filtrar
`serie.moderation_status = 'aprobada'` explícitamente (el RLS del rol anon lo
haría por política). Alternativa equivalente (leer valoraciones/reseñas/listas
con el cliente anon) se descarta por duplicar clientes sin beneficio de
seguridad (todos los datos son públicos por diseño, decisión 3).

## Decisiones técnicas

### 1. Regla única de username derivado del email (misma en SQL y TS)
`lower(sanitizado(local-part del email))` truncado a 13 chars + sufijo corto
derivado del id (`'-' || left(replace(id::text,'-',''),6)`). El sufijo
derivado del id garantiza unicidad de forma determinista (incluso para
usuarios con la misma local-part en dominios distintos), sin bucles de
retry. Si la local-part deja vacío tras sanitizar (o el email es NULL/''), la
base es `usuario`.

Sanitización (idéntica en SQL y TS): a) unaccent/NFD, b) minúsculas, c)
cualquier carácter fuera de `[a-z0-9_-]` → `_` (colapso de runas), d) recortar
`_` iniciales/finales, e) `slice(0, 13)`.

SQL (backfill que usa la columna `email` desnormalizada de M6):
```sql
lower(
  left(
    coalesce(
      nullif(
        trim(both '_' from regexp_replace(
          extensions.unaccent(coalesce(split_part(nullif(u.email,''),'@',1),'')),
          '[^a-z0-9_-]+', '_', 'g')),
        ''),
      'usuario'),
    13)
) || '-' || left(replace(u.id::text,'-',''),6)
```

TS (mismo resultado; `mirror` de lib/admin.ts slugify):
```ts
function usernameDesdeEmail(email: string, userId: string): string {
  const base = (email.split('@')[0] ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 13) || 'usuario'
  return `${base}-${userId.replaceAll('-', '').slice(0, 6)}`
}
```

### 2. Dónde se genera el username en registros nuevos
Como la fila `public.usuario` la crean `registrarUsuario` (signUp) y
`asegurarFilaUsuario` (self-healing de lib/auth.ts), el username por defecto
se calcula ahí en TS con la regla anterior (el `user.id` ya existe en ambos
puntos). El constraint UNIQUE de la BD queda de backstop (carrera 23505 se
tolera como en F008). El `upsert ignoreDuplicates` de asegurarFilaUsuario se
mantiene: nunca sobreescribe un username ya elegido por el usuario.

### 3. Migración M14 (nombre `20260904…_add_usuario_username.sql`)
Orden estricto:
1. `alter table public.usuario add column username text;`
2. Backfill (update con la regla SQL, `where username is null`).
3. `alter column username set not null`.
4. `add constraint usuario_username_unique unique (username)`.
5. `add constraint usuario_username_len check (username ~ '^[a-z0-9_-]{3,20}$')`.

El unique crea índice (no se añade ninguno extra) y toda lectura es por
`eq('username', ...)` sobre valor ya en minúsculas. **No hay cambios de RLS
en M14** (verificación previa). Al terminar: `npm run gen:types`.

### 4. Edición de username en `/perfil` (extensión de F015)
- `lib/auth.ts`: `cambiarUsernameSchema` (Zod v4, `.trim().toLowerCase()
  .regex(/^[a-z0-9_-]{3,20}$/)`), servicio `cambiarUsername(client, username)`
  (update fila propia; `code === '23505'` → `ERRORES_AUTH.usernameEnUso`),
  `ERRORES_AUTH.usernameEnUso` / `usernameOk`, y `PerfilData` + `selectUsuario`
  ganan `username`.
- `lib/auth-actions.ts`: `accionCambiarUsername` (mismo patrón que
  `accionCambiarDisplayName`; `revalidatePath('/perfil')`).
- `components/cambiar-username-form.tsx` (clon de cambiar-displayname-form).
- `app/perfil/page.tsx`: fila `username` en "Datos de la cuenta" (el dt "Nombre
  de usuario" pasa a "Nombre mostrado" para distinguirlo del username nuevo),
  card "Cambiar nombre de usuario (URL)" con el form, y link **"Ver mi perfil
  público"** → `/usuarios/<username>`.

### 5. `lib/perfil-publico.ts` (nuevo) + ruta `/usuarios/[username]`
`getPerfilPublico(username)` con un único `createServiceRoleClient()`:
1. `usuario`: `select('username, display_name, created_at')`
   `.eq('username', username.toLowerCase()).maybeSingle()` → si `null`,
   retorna `null` (la página hará `notFound()`). Nunca se selecciona `email`.
2. Seguidas: `usuario_serie` por `usuario_id`, embed
   `serie ( titulo, slug, portada_url, moderation_status )` con filtro anidado
   `serie.moderation_status = aprobada`, orden `created_at desc`.
3. Valoraciones: `valoracion` por `user_id`, embed
   `serie ( titulo, slug, moderation_status )`, filtro aprobada, `nota`
   visible, orden `created_at desc`.
4. Reseñas públicas: `reseña` por `user_id`, embed `serie (…)`, filtro
   aprobada, orden `created_at desc`. Sin embed de `usuario(email)`.
5. Listas públicas: `lista` con `es_publica = true` por `user_id` + conteo de
   `lista_serie` por `lista_id IN` (patrón `listMisListas` de lib/listas.ts).

Retorno: `{ usuario, seguidas, valoraciones, resenasPublicas, listasPublicas }`.
Sin email, sin rol, sin datos privados.

`app/usuarios/[username]/page.tsx` (RSC, `dynamic = "force-dynamic"`):
`params` como Promise (Next 16), `getPerfilPublico(username)` → `notFound()`
si `null` (USR-04). Secciones: cabecera (`username` en h1, `display_name`,
"Miembro desde" formateado en es-ES), "Series seguidas" (links
`/series/<slug>`), "Valoraciones" (`nota/10` + fecha + link), "Reseñas
públicas", "Listas públicas" (link `/listas/<id>`, existe `app/listas/[id]`).
Sin session guard: ruta accesible sin sesión (USR-03).

`notFound` vs `redirect`: se usa `notFound()` (USR-04 exige 404); al ser la
página `force-dynamic`, el 404 se decide antes de emitir el shell (patrón
hallazgo F004).

### 6. Tests
- `tests/db/username.test.ts`: constraint unique (23505 con 2 filas mismo
  username) · CHECK formato (23514 con mayúsculas) · invariante post-backfill
  (toda fila con username not null, único y `^[a-z0-9_-]{3,20}$`) · **regresión
  de fuga**: anon no puede SELECT `usuario` (ni email ni username ajeno) y un
  autenticado ajeno ve 0 filas de `usuario` (M7) y de `usuario_serie` (M11).
- `tests/lib/auth.test.ts` / `tests/db/perfil.test.ts`: `cambiarUsernameSchema`
  (ok/`<3`/`>20`/mayúsculas/carácter inválido) + `cambiarUsername` (éxito,
  duplicado → `usernameEnUso`, formato inválido → error Zod).
- `tests/lib/perfil-publico.test.ts` (nuevo, patrón tests/lib/valoraciones
  con fixture): perfil existente devuelve datos públicos · inexistente →
  `null` · el retorno **no contiene email** · series no aprobadas excluidas ·
  listas privadas excluidas.
- `e2e/perfil-publico.spec.ts` (nuevo): registro → `/perfil` muestra el
  username generado · editar username → visible y en "Datos de la cuenta" ·
  `/usuarios/<username>` muestra actividad pública y NO contiene el email ·
  `/usuarios/<inexistente>` → HTTP 404.

## Archivos a crear/modificar

### Nuevos
1. `supabase/migrations/<ts>_add_usuario_username.sql` — M14.
2. `lib/perfil-publico.ts` — `getPerfilPublico` + tipos.
3. `components/cambiar-username-form.tsx` — form de edición de username.
4. `app/usuarios/[username]/page.tsx` — perfil público (RSC, force-dynamic).
5. `tests/db/username.test.ts` — M14 invariantes + regresión RLS.
6. `tests/lib/perfil-publico.test.ts` — datos públicos sin email.
7. `e2e/perfil-publico.spec.ts` — flujo completo + 404.

### Modificar
1. `lib/auth.ts` — schema/servicio `cambiarUsername`, `ERRORES_AUTH`,
   `PerfilData.username`, `usernameDesdeEmail` en `registrarUsuario`/
   `asegurarFilaUsuario`.
2. `lib/auth-actions.ts` — `accionCambiarUsername`.
3. `app/perfil/page.tsx` — dd username, link "Ver mi perfil público", card de
   edición, renombrado del dt "Nombre mostrado".
4. `types/database.ts` — regenerado (`npm run gen:types`).
5. `ROADMAP.md` — 021 ✅ (cierre T5).
6. `DECISIONS.md` — D27 (cierre T5).
7. `docs/memory/session-log.md` — sesión F021 (cierre T5).

## Riesgos técnicos

| Riesgo | Mitigación |
|--------|------------|
| Fuga de email: `usuario.select` público expone `email` | Verificado: anon sin grant (M2) + M7 solo-propio. Sin policy nueva; lectura cross-user solo con service_role server-side. Test de regresión en username.test.ts |
| Leer follows ajenos con RLS solo-propio de M11 | service_role (D25/D26), patrón `seguidoresPorSerie`. Sin política pública nueva |
| Backfill único no determinista / colisiones del sufijo | Sufijo derivado del id (inyectivo en la práctica: 16^6 ≈ 16,7M); base truncada a 13. Constraint UNIQUE como backstop; si 23505 en backfill la migración falla alto y avisa |
| Desfase TS vs SQL en la regla del username por defecto | Misma regla documentada en ambos lados y cubierta por tests ("registro genera username" en E2E y `tests/db/username.test.ts`) |
| Colisión de username tras edición | 23505 → `ERRORES_AUTH.usernameEnUso` (mensaje amigable), sin mensaje crudo de Postgres |
| `notFound()` vs `redirect` | USR-04 exige 404: `notFound()`. Página force-dynamic → 404 decidido antes del shell (patrón F004) |
| Mayúsculas en la URL / duplicados por case | Store siempre minúsculas (schema TS + CHECK BD); lookup con `username.toLowerCase()` |

## Qué NO harás (fuera de alcance)
- Seguir a usuarios, feed de actividad de seguidos (F022)
- Flags de privacidad (todo público por defecto, follow-up)
- Avatar, bio o personalización del perfil
- Links desde reseñas/listas al perfil del autor (follow-up)
- Bloqueo de usuarios / moderación de perfiles
- Cambiar el RLS existente (M7/M11 se mantienen intactos; solo lectura
  service_role server-side)
- Público del email o datos privados en cualquier punto
- Migraciones fuera de M14
- Commits ni tag: se generan solo con orden explícita del usuario