# Plan técnico — Feature 017: OAuth Google

## Arquitectura y decisiones

### Patrones existentes a seguir
- **@supabase/ssr** con `createServerClient` para gestión de cookies (F008).
- **Servicios inyectables** en `lib/` que reciben `AuthClient` por parámetro (patrón F009/F012/F013).
- **requireUser()** de `lib/auth.ts` para rutas protegidas.
- **Server Components por defecto**, `"use client"` solo con justificación (listener del browser).
- **Server Actions** para acciones de formulario (D6).

### Decisiones de diseño (aprobadas sin ajustes)
1. **Browser client factory + listener en layout**: el intercambio de tokens con
   Google requiere la API browser de Supabase Auth (el listener detecta la
   URL con el código/error de retorno). Se instancia un cliente browser
   (`src/browser-client.ts`) y un listener en `components/auth-listener.tsx`
   montado en el layout `app/layout.tsx`. Esto es necesario para el
   intercambio automático del código por tokens.
2. **skip_nonce_check = true**: requerido para Google en local (GoTrue no
   verifica el nonce con el provider en desarrollo).
3. **env(GOOGLE_OAUTH_CLIENT_ID, ) con default vacío**: el config.toml usa
   sustitución de env var con default vacío para que `supabase start` y
   validate.sh funcionen sin credenciales (OAUTH-05).

### Configuración en supabase/config.toml

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_OAUTH_CLIENT_ID, )"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(GOOGLE_OAUTH_CLIENT_SECRET, )"
# Overrides the default auth callback URL derived from auth.external_url.
redirect_uri = ""
# If enabled, the nonce check will be skipped. Required for local sign in with Google auth.
skip_nonce_check = true
```

### Prerrequisito de Google Cloud Console (documentado)
Para que el flujo funcione en local:
1. Ir a Google Cloud Console → API & Services → Credentials.
2. Crear un **OAuth 2.0 Client ID** con tipo **Web application**.
3. En **Authorized redirect URIs** añadir:
   `http://127.0.0.1:54321/auth/v1/callback`
4. Copiar el Client ID y Client Secret a variables de entorno:
   `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET`.

## Archivos a crear/modificar

### Nuevos
1. `lib/oauth.ts` — Servicios del flujo OAuth (intercambio, creación de usuario)
2. `lib/browser-client.ts` — Browser Supabase client factory
3. `components/auth-listener.tsx` — Listener del browser para el intercambio (Client Component)
4. `tests/lib/oauth.test.ts` — Tests de servidor

### Modificar
1. `supabase/config.toml` — Añadir `[auth.external.google]`
2. `app/layout.tsx` — Montar `<AuthListener />`
3. `.env.example` / `.env.local` — Documentar `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
4. `app/login/page.tsx` — Añadir botón "Continuar con Google"
5. `app/auth/callback/route.ts` — Route handler del callback (si necesario)

## Servicios en `lib/oauth.ts`

```typescript
// Servicios inyectables (reciben AuthClient)
export async function signInWithGoogle(browserClient: SupabaseClient<Database>): Promise<{ error?: string }>
export async function getOrCreateUsuario(client: AuthClient, googleUser: User): Promise<{ usuarioId: string }>
export function parseAuthorizationCode(url: string): string | null
```

## Prerrequisito documentado (Google Cloud Console)
Ver sección "Prerrequisito de Google Cloud Console" arriba. Se documenta en:
- `docs/oauth-google.md` (nuevo)
- Comentarios en `supabase/config.toml`

## Tests

### `tests/lib/oauth.test.ts`
- Fixture: usuario google simulado
- `getOrCreateUsuario`: crea fila usuario si no existe, reutiliza si existe
- `parseAuthorizationCode`: extrae el código de una URL de callback
- `signInWithGoogle`: error si no hay client_id configurado

### `e2e/oauth.spec.ts` (T posterior)
- Flujo completo con mock de Google (según disponibilidad)

## Riesgos técnicos
1. **validate.sh sin credenciales**: con default vacío, `supabase start` debe
   arrancar sano. `[auth.external.google]` con `enabled = true` y client_id
   vacío no debe romper el arranque local.
2. **Listener vs API server**: en local no hay necesidad de route handler si
   el listener del browser maneja el intercambio. Evaluar según la respuesta
   de Supabase.
3. **CORS/callback URL**: redirect_uri vacío usa el derivado de
   `auth.external_url`, que localmente es `http://127.0.0.1:54321`. Debe
   coincidir con el configurado en Google Cloud Console.

## Fuera de alcance (no se hará)
- Otros proveedores OAuth
- Gestión de cuentas vinculadas (link/unlink)
- UI de configuración de OAuth para admins
- Servicios o UI de OAuth todavía (solo T1: config + documentación)