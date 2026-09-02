# 017 — OAuth Google

## Contexto
Feature L2. Añade autenticación con Google OAuth como alternativa al login
existente con email/password. Usa el flujo Authorization Code con PKCE de
Supabase Auth. Requiere configuración en Google Cloud Console y en
supabase/config.toml. El intercambio de tokens se gestiona automáticamente
en el browser via un listener en el layout.

## Rutas
- `/login`: se añade botón "Continuar con Google" al formulario existente
- `/auth/callback`: ruta de retorno de Google (callback URL)

## Requisitos (EARS)
- OAUTH-01: Cuando un usuario hace clic en "Continuar con Google" en /login,
  el sistema deberá redirigir a Google para autorización.
- OAUTH-02: Cuando Google redirige a /auth/callback con el código de autorización,
  el sistema deberá intercambiar el código por tokens y crear sesión.
- OAUTH-03: Si el usuario no existe en auth.users, el sistema deberá crearlo
  automáticamente (auto-cadastro) con rol 'user' en public.usuario.
- OAUTH-04: Si el usuario ya existe, el sistema deberá iniciar sesión
  directamente.
- OAUTH-05: El flujo deberá funcionar sin credenciales de Google configuradas
  (validate.sh no se rompe).
- OAUTH-06: En entorno local, el nonce check deberá ser saltado (skip_nonce_check=true)
  para que el flujo funcione correctamente.
- OAUTH-07: El client ID de Google deberá configurable via env var con default vacío.

## Criterios de aceptación
- [ ] Botón "Continuar con Google" visible en /login.
- [ ] Click en botón redirige a Google OAuth.
- [ ] Callback /auth/callback intercambia código por tokens.
- [ ] Usuario nuevo se crea automáticamente con rol 'user'.
- [ ] Usuario existente inicia sesión.
- [ ] validate.sh en verde sin credenciales de Google.
- [ ] Tests de servidor para el flujo de callback.
- [ ] Test E2E: flujo completo con Google mock.

## Fuera de alcance
- Otros proveedores OAuth (GitHub, Apple, etc.)
- Gestión de cuentas vinculadas (link/unlink)
- Selección de cuenta de Google
- UI de configuración de OAuth para admins