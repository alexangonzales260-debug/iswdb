# Tasks — Feature 017: OAuth Google

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Config Google OAuth en supabase/config.toml + documentación del prerrequisito
**Estado**: ✅ Completa
**Objetivo**: Configurar el proveedor Google en el config local de Supabase y
documentar el prerrequisito de Google Cloud Console. No se crea servicio ni UI.

**Entregables**:
- Modificar `supabase/config.toml` añadiendo:
  ```toml
  [auth.external.google]
  enabled = true
  client_id = "env(GOOGLE_OAUTH_CLIENT_ID, )"
  secret = "env(GOOGLE_OAUTH_CLIENT_SECRET, )"
  redirect_uri = ""
  skip_nonce_check = true
  ```
- Añadir `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` a
  `.env.example` (con comentario del prerrequisito) — no a `.env.local`
  (no hay credenciales reales).
- Crear `docs/oauth-google.md` documentando:
  - Google Cloud Console → API & Services → Credentials → OAuth 2.0 Client ID.
  - Tipo **Web application**.
  - **Authorized redirect URIs** = `http://127.0.0.1:54321/auth/v1/callback`.
  - Copiar Client ID/Secret a `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
  - Recordatorio local: `skip_nonce_check = true` (necesario en local).

**Validación**: `supabase start` arranca sano sin credenciales (validate.sh no se rompe).

Salida real (sin GOOGLE_OAUTH_CLIENT_ID/SECRET en el entorno):
```
$ GOOGLE_OAUTH_CLIENT_ID= GOOGLE_OAUTH_CLIENT_SECRET= supabase start
╭──────────────────────────────────────╮
│ 🔧 Development Tools                 │
├─────────┬────────────────────────────┤
│ Studio  │ http://127.0.0.1:54323     │
│ Mailpit │ http://127.0.0.1:54324     │
│ MCP     │ http://127.0.0.1:54321/mcp │
╰──────────────────────────────────────╯
├ Project URL    │ http://127.0.0.1:54321 │
└───────────────────────────────────────┘
---EXIT:0

$ curl -s http://127.0.0.1:54321/auth/v1/settings
external: { "google": true, ... }   # Google habilitado en Auth local
```

---

## T2: lib/browser-client.ts + components/auth-listener.tsx — Browser client factory + listener en layout
**Estado**: ⏳ Pendiente
**Objetivo**: Instanciar el cliente Supabase de browser y montar el listener
que intercambia el código de Google por tokens automáticamente.

**Entregables**:
- `lib/browser-client.ts`: crear `createBrowserClient<Database>` de @supabase/ssr
- `components/auth-listener.tsx` (Client Component) montado en `app/layout.tsx`
- Detecta URL con `code`/`error` de Google y completa el intercambio

**Validación**: `npm run lint && npm run typecheck`

---

## T3: lib/oauth.ts — Servicios del flujo OAuth
**Estado**: ⏳ Pendiente
**Objetivo**: Servicios inyectables para firma con Google y creación de usuario.

**Entregables**:
- `lib/oauth.ts` con `signInWithGoogle`, `getOrCreateUsuario`, `parseAuthorizationCode`
- Manejo del caso sin credenciales (error claro)

**Tests**: `tests/lib/oauth.test.ts`
- `getOrCreateUsuario`: crea usuario si no existe, reutiliza fila existente
- `parseAuthorizationCode`: extrae código de URL de callback
- `signInWithGoogle`: error si client_id vacío

**Validación**: `npm run test tests/lib/oauth.test.ts`

---

## T4: Botón "Continuar con Google" en /login
**Estado**: ⏳ Pendiente
**Objetivo**: Añadir el botón de OAuth al formulario de login existente.

**Entregables**:
- Modificar `components/login-form.tsx` (o `app/login/page.tsx`)
- Botón que llama a `signInWithGoogle` y redirige a Google

**Validación**: `npm run lint && npm run typecheck`

---

## T5: Route handler /auth/callback (si necesario)
**Estado**: ⏳ Pendiente
**Objetivo**: Route handler del callback si el listener del browser no es suficiente.

**Entregables**:
- `app/auth/callback/route.ts` si se requiere
- Intercambio del código por tokens y redirect a /perfil

**Validación**: `npm run lint && npm run typecheck`

---

## T6: e2e/oauth.spec.ts — Test E2E Playwright
**Estado**: ✅ Completa
**Objetivo**: Verificar que el botón "Continuar con Google" existe y está
habilitado en /login y /registro, y que el flujo email/password sigue intacto
(regresión). No se mockea el flujo OAuth real con Google.

**Entregables**:
- `e2e/oauth.spec.ts` con verificación del botón + regresión email/password

**Validación**: `npm run test:e2e e2e/oauth.spec.ts` → 3 tests verdes.

---

## T7: Validación completa
**Estado**: ✅ Completa
**Objetivo**: Ejecutar `./validate.sh` y confirmar verde.

**Entregables**:
- Salida real de `./validate.sh`: 289 unit + 63 E2E en verde
  (lint, typecheck, tests, build y e2e OK).

**Comando**: `./validate.sh`

---

## T8: Cierre — ROADMAP + session-log + commit
**Estado**: ✅ Completa
**Objetivo**: Cierre de la feature 017.

**Entregables**:
- `ROADMAP.md`: 017 ✅
- `docs/memory/session-log.md`: sesión F017
- `DECISIONS.md`: ADR D23
- Commit atómico `F17: …` + tag F17

**Validación**: Definition of Done completa.

---

## T9: Flujo OAuth real con Google — manual / follow-up
**Estado**: 🔧 Manual / follow-up
**Objetivo**: Validar el flujo OAuth completo de extremo a extremo con
credenciales reales de Google Cloud Console. No automatizable en CI sin
credenciales/víctimas de flujo interactivo.

**Requisito**: credenciales válidas en Google Cloud Console
(`GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` en el entorno) y la
redirect URI `http://127.0.0.1:54321/auth/v1/callback` configurada
(ver `docs/oauth-google.md`).

**Procedimiento** (manual):
1. Poner las credenciales reales y `supabase restart`.
2. Ir a /login → "Continuar con Google" → autorizar en Google.
3. Confirmar el merge de cuentas (mismo email → mismo auth.users.id).
4. Confirmar que /perfil muestra la sesión y el refresh del listener.

**Estado**: sin credenciales el botón devuelve 401 invalid_client (error
esperado; el botón funciona, solo faltan credenciales).

---

## Resumen de archivos

### Nuevos
1. `lib/oauth.ts`
2. `lib/browser-client.ts`
3. `components/auth-listener.tsx`
4. `tests/lib/oauth.test.ts`
5. `e2e/oauth.spec.ts`
6. `docs/oauth-google.md`
7. `app/auth/callback/route.ts` (si necesario)

### Modificados
1. `supabase/config.toml`
2. `app/layout.tsx`
3. `.env.example`
4. `app/login/page.tsx`
5. `components/login-form.tsx`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| validate.sh se rompe sin credenciales de Google | env(GOOGLE_OAUTH_CLIENT_ID, ) con default vacío; `supabase start` arranca sano |
| Google en local falla por nonce | skip_nonce_check = true (requerido en local) |
| Intercambio de tokens requiere browser | Browser client factory + listener en layout (decisión 1 aprobada) |
| CORS/callback URL no coincide | redirect_uri derivado de auth.external_url (127.0.0.1:54321) documentado |

---

## Fuera de alcance (NO se hace)
- Otros proveedores OAuth
- Gestión de cuentas vinculadas (link/unlink)
- UI de configuración de OAuth para admins
- En T1: NO se crean servicios ni UI todavía