# 008 — Login/Registro

## Contexto
Feature L2. Implementa autenticación con Supabase Auth (email/password).
Permite a usuarios registrarse, iniciar sesión y ver su perfil. Las acciones
de escritura (valorar, reseñar) requieren login; el catálogo público sigue
siendo anónimo. Usa @supabase/ssr para gestión de cookies en App Router.

## Rutas
- `/login`: formulario de inicio de sesión
- `/registro`: formulario de registro
- `/perfil`: página del usuario autenticado (datos + sus valoraciones)
- `/logout`: acción de cierre de sesión (POST)

## Requisitos (EARS)
- AUTH-01: Cuando un visitante anónimo accede a /registro, el sistema deberá
  mostrar un formulario con email y password (mínimo 8 caracteres). Al enviar,
  crea un usuario en auth.users + fila en public.usuario con rol='user',
  redirige a /perfil y muestra confirmación.
- AUTH-02: Cuando un visitante anónimo accede a /login, el sistema deberá
  mostrar un formulario con email y password. Al enviar, autentica y redirige
  a /perfil. Si las credenciales son incorrectas, muestra error sin redirigir.
- AUTH-03: Cuando un usuario autenticado accede a /perfil, el sistema deberá
  mostrar su email, fecha de registro, rol, y listado de sus valoraciones
  (serie + nota + fecha) con enlaces a las fichas.
- AUTH-04: Cuando un usuario autenticado hace logout, el sistema deberá
  cerrar la sesión y redirigir a /.
- AUTH-05: Cuando un usuario intenta acceder a /login o /registro estando
  autenticado, el sistema deberá redirigir a /perfil.
- AUTH-06: Cuando un usuario intenta una acción de escritura sin login
  (p.ej. valorar en F009), el sistema deberá redirigir a /login con mensaje
  "Debes iniciar sesión para valorar" y callback URL para volver.
- AUTH-07: El sistema usará @supabase/ssr para gestión de cookies en App Router.
- AUTH-08: El catálogo público (/, /series, /series/<slug>, /canales/<handle>)
  NO requiere login.
- AUTH-09: El header global mostrará avatar/email si hay sesión, o enlaces
  a /login y /registro si no.

## Criterios de aceptación
- [ ] GET /registro muestra formulario; POST crea usuario + redirige a /perfil.
- [ ] GET /login muestra formulario; POST con credenciales correctas redirige
      a /perfil; POST con credenciales incorrectas muestra error.
- [ ] GET /perfil con usuario autenticado muestra datos + valoraciones.
- [ ] GET /perfil sin usuario autenticado redirige a /login.
- [ ] POST /logout cierra sesión y redirige a /.
- [ ] GET /login o /registro con usuario autenticado redirige a /perfil.
- [ ] Header muestra estado de sesión correctamente.
- [ ] Catálogo público sigue siendo anónimo (sin login requerido).
- [ ] ./validate.sh en verde.
- [ ] Tests de servidor: creación de usuario, autenticación correcta/incorrecta,
      perfil con/sin sesión, logout.
- [ ] Test E2E Playwright: registro → login → perfil → logout.

## Fuera de alcance
- OAuth (Google, GitHub, etc.)
- Recuperación de password (olvidé mi contraseña)
- Verificación de email (confirmar cuenta)
- 2FA
- Gestión de roles (admin/mod) — F010
- Edición de perfil (cambiar email/password) — F010
