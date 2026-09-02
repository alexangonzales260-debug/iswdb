# OAuth con Google — Prerrequisito y configuración local

Feature 017. Para habilitar "Continuar con Google" en local hay que crear un
OAuth Client en Google Cloud Console y volcar sus credenciales en variables
de entorno. Sin credenciales el stack arranca igual (default vacío):
`supabase start` y validate.sh no se rompen (OAUTH-05).

## 1. Crear el OAuth 2.0 Client en Google Cloud Console

1. Ir a [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Si no hay proyecto, crear uno (p.ej. `iswdb-local`).
3. **API & Services → Credentials**.
4. **+ Crear credenciales → ID de cliente OAuth 2.0**.
5. En **Tipo de aplicación** elegir **Aplicación web** (Web application).
6. En **Authorized JavaScript origins**:
   - `http://127.0.0.1:3000`
7. En **Authorized redirect URIs** añadir exactamente:
   - `http://127.0.0.1:54321/auth/v1/callback`
8. **Crear**. Se mostrarán los valores **Client ID** y **Client Secret**.

> La URI de redirección deriva del `site_url`/`external_url` de Supabase Auth
> (`http://127.0.0.1:54321` + `/auth/v1/callback`). Debe coincidir a rajatabla
> con la URL configurada en Google Cloud Console, incluyendo el puerto.

## 2. Volcar las credenciales a variables de entorno

Copia `.env.example` a `.env.local` y rellena:

```bash
GOOGLE_OAUTH_CLIENT_ID=<Client ID de Google>
GOOGLE_OAUTH_CLIENT_SECRET=<Client Secret de Google>
```

Nunca se deben poner en el código ni commitear (CONSTRAINTS: sin secretos en
el repo). Solo viven en `.env.local` (ignorado por git).

## 3. Configuración en supabase/config.toml

Ya configurada en T1 de F017:

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_OAUTH_CLIENT_ID, )"
secret = "env(GOOGLE_OAUTH_CLIENT_SECRET, )"
redirect_uri = ""
skip_nonce_check = true
```

Notas:
- `env(..., )` con default vacío permite arrancar sin credenciales.
- `skip_nonce_check = true` es **requerido para Google en local** (GoTrue no
  completa el nonce check contra el provider en desarrollo).
- `redirect_uri = ""` usa el callback derivado de `auth.external_url`.

## 4. Tras tocar config.toml

Reinicia el stack local para que Surreal/GoTrue tome la nueva configuración:

```bash
supabase stop
supabase start
```

Verificar en Studio → Authentication → Providers que **Google** aparece
habilitado.

## Próximos pasos (T2+ de F017)

El flujo de login con Google se implementará en tareas posteriores
(browser client factory + listener en layout, botón en /login).
