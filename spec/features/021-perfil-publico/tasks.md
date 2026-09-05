# Tasks — Feature 021: Perfil público

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Migración M14 (username + backfill + RLS check)
**Estado**: Pendiente
**Objetivo**: Columna username única y poblada para todos los usuarios.

**Entregables**:
- `supabase/migrations/<ts>_add_usuario_username.sql` (nuevo, M14):
  1. `alter table public.usuario add column username text;`
  2. Backfill: `lower(sanitizado(local-part del email)) + '-' ||
     left(replace(id::text,'-',''),6)` con `extensions.unaccent`,
     `regexp_replace('[^a-z0-9_-]+', '_','g')`, trim de `_`, base `'usuario'`
     si vacío, slice 13 (regla única SQL, mirror en TS).
  3. `alter column username set not null`.
  4. `add constraint usuario_username_unique unique (username)`.
  5. `add constraint usuario_username_len check (username ~ '^[a-z0-9_-]{3,20}$')`.
- `npm run gen:types` (regenera types/database.ts).
- **Verificación de RLS**: se documenta en plan.md — `public.usuario` no
  expone email a anon (M2: sin grant; M7: solo-propio) y `usuario_serie` es
  select-own (M11). **Sin corrección de RLS**; lectura cross-user con
  `createServiceRoleClient()` (D25).
- `tests/db/username.test.ts` (nuevo): backfill deja toda fila con username
  not null y `^[a-z0-9_-]{3,20}$` · unique (23505) · CHECK formato (23514) ·
  regresión: anon no lee `usuario` (ni email ni username ajeno) y un
  autenticado ajeno ve 0 filas en `usuario` y `usuario_serie`.

**Validación**: `npm test -- --run tests/db/username.test.ts` verde (BD local
arriba) y `npm run typecheck`.

---

## T2: Edición de username en /perfil (extensión F015)
**Estado**: Pendiente
**Objetivo**: Username editable con validación Zod, unicidad amigable y link.

**Entregables**:
- `lib/auth.ts`:
  - `cambiarUsernameSchema` — `.trim().toLowerCase().regex(/^[a-z0-9_-]{3,20}$/)`
    con mensaje de error en español.
  - `cambiarUsername(client, username)` — update fila propia; `23505` →
    `ERRORES_AUTH.usernameEnUso`.
  - `ERRORES_AUTH.usernameEnUso` ("Ese nombre de usuario ya está en uso") y
    `usernameOk` ("Nombre de usuario actualizado").
  - `PerfilData` + `selectUsuario` incluyen `username`.
  - `usernameDesdeEmail(email, userId)` aplicado en `registrarUsuario` y
    `asegurarFilaUsuario` (misma regla que el backfill).
- `lib/auth-actions.ts`: `accionCambiarUsername` (patrón accionCambiarDisplayName +
  `revalidatePath('/perfil')`).
- `components/cambiar-username-form.tsx` (nuevo, clon de
  cambiar-displayname-form).
- `app/perfil/page.tsx`: dd `username` en "Datos de la cuenta" (dt "Nombre de
  usuario" → "Nombre mostrado"), card "Cambiar nombre de usuario (URL)", link
  "Ver mi perfil público" → `/usuarios/<username>`.
- Tests: `tests/db/perfil.test.ts` + `tests/lib/auth.test.ts` — schema
  (ok / <3 / >20 / mayúsculas / carácter inválido) y servicio (éxito,
  duplicado → usernameEnUso).

**Validación**: `npm run lint && npm run typecheck` y tests de perfil en verde.

---

## T3: lib/perfil-publico.ts + ruta /usuarios/[username]
**Estado**: Pendiente
**Objetivo**: Perfil público cross-user sin email ni datos privados.

**Entregables**:
- `lib/perfil-publico.ts` (nuevo): `getPerfilPublico(username)` con
  `createServiceRoleClient()` (D25) → `{ usuario: { username, display_name,
  created_at } (sin email, sin rol), seguidas, valoraciones (nota visible),
  resenasPublicas, listasPublicas }` · `null` si el username no existe ·
  filtro `serie.moderation_status = 'aprobada'` en embeds · listas solo
  `es_publica = true` · conteo de series por lista (patrón listMisListas).
- `app/usuarios/[username]/page.tsx` (nuevo, RSC, `force-dynamic`): params como
  Promise (Next 16); `null` → `notFound()` (404); cabecera (username h1,
  display_name, "Miembro desde"), secciones seguidas / valoraciones / reseñas
  públicas / listas públicas. Sin email en ningún render.
- `tests/lib/perfil-publico.test.ts` (nuevo, fixture estilo
  tests/lib/valoraciones.test.ts): perfil existente devuelve datos · inexistente
  → null · **sin email en el retorno** · series no aprobadas excluidas · listas
  privadas excluidas.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/perfil-publico.test.ts` verde.

---

## T4: E2E Playwright
**Estado**: Pendiente
**Objetivo**: Flujo real de registro → username → perfil público → 404.

**Entregables**:
- `e2e/perfil-publico.spec.ts` (nuevo):
  - Registro por UI → `/perfil?bienvenida=1` → username generado visible en
    "Datos de la cuenta" y link "Ver mi perfil público".
  - Editar username en `/perfil` → visible tras revalidación.
  - `/usuarios/<username>` (sin sesión): cabecera + actividad pública y NO
    muestra el email.
  - `/usuarios/<username-inexistente>` → HTTP 404.
  - Cleanup: deleteAuthUser / deleteAuthUserByEmail (cascade cubre usuario).

**Validación**: `npm run test:e2e e2e/perfil-publico.spec.ts` verde; sin
regresiones en perfil.spec.ts.

---

## T5: validate.sh + cierre
**Estado**: Pendiente
**Objetivo**: Puerta única y docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 021 ✅.
- `DECISIONS.md`: D27 "Username único + perfil público: columna username con
  backfill derivado del email (M14); lectura cross-user de usuario/usuario_serie
  con service_role (D25) porque el RLS es solo-propio (M7/M11); sin política
  pública nueva; todo público por defecto".
- `docs/memory/session-log.md`: sesión F021.

**Validación**: `./validate.sh` en verde; Definition of Done completa. (El
commit/tag F21 solo se hace con orden explícita.)

---

## Resumen de archivos

### Nuevos (7)
1. `supabase/migrations/<ts>_add_usuario_username.sql`
2. `lib/perfil-publico.ts`
3. `components/cambiar-username-form.tsx`
4. `app/usuarios/[username]/page.tsx`
5. `tests/db/username.test.ts`
6. `tests/lib/perfil-publico.test.ts`
7. `e2e/perfil-publico.spec.ts`

### Modificados (7)
1. `lib/auth.ts`
2. `lib/auth-actions.ts`
3. `app/perfil/page.tsx`
4. `types/database.ts` (gen:types)
5. `ROADMAP.md`
6. `DECISIONS.md`
7. `docs/memory/session-log.md`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Fuga de email por expandir select de usuario | Verificado en plan: anon sin grant (M2) + M7 solo-propio; no se toca RLS; prueba regresión en username.test.ts |
| Follows ajenos bloqueados por RLS own de M11 | service_role server-side (D25/D26), patrón seguidoresPorSerie |
| Backfill no único / colisiones de sufijo | Sufijo derivado del id (16^6 en la práctica); UNIQUE de backstop |
| Desfase TS vs SQL en username por defecto | Regla única documentada + tests E2E/servidor |
| Colisión de username al editar | 23505 → mensaje amigable (usernameEnUso) |
| notFound vs redirect | USR-04: notFound() ; force-dynamic decide el 404 antes del shell |

---

## Fuera de alcance (NO se hace)
- Seguir a usuarios / feed de seguidos (F022)
- Flags de privacidad (todo público por defecto)
- Avatar / bio / personalización del perfil
- Links desde reseñas/listas al perfil del autor (follow-up)
- Bloqueo de usuarios / moderación de perfiles
- Cambios a RLS (M7/M11 intactos)
- Mostrar email o datos privados
- Migraciones distintas de M14