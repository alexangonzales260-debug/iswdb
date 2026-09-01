# 014 — Recuperación de password

## Contexto
Feature L2. Permite a un usuario que olvidó su password recuperarla vía email.
Usa el flujo nativo de Supabase GoTrue (resetPasswordForEmail + updateUser).
No requiere migración (usa auth.users existente). En local, el email de
recuperación se verifica en Mailpit (puerto 54324).

## Rutas
- `/recuperar`: formulario para pedir el email de recuperación.
- `/recuperar/enviado`: página de confirmación "Revisa tu email".
- `/recuperar/confirmar`: formulario para poner la nueva password (recibe la
  sesión del callback de GoTrue).

## Requisitos (EARS)
- REC-01: Cuando un usuario envía un email en /recuperar, el sistema deberá
  llamar a resetPasswordForEmail y mostrar SIEMPRE el mensaje genérico "Si
  existe una cuenta con ese email, te hemos enviado un link" (no revelar si
  el email existe).
- REC-02: Cuando el email existe, el sistema deberá enviar un link de
  recuperación a Mailpit (local) con expiración por defecto de GoTrue.
- REC-03: Cuando el usuario hace click en el link del email, el sistema deberá
  intercambiar el code por sesión (route handler de callback) y redirect a
  /recuperar/confirmar.
- REC-04: Cuando el usuario envía una nueva password válida en
  /recuperar/confirmar, el sistema deberá llamar a updateUser({ password }) y
  redirect a /login.
- REC-05: La nueva password deberá tener mínimo 8 caracteres y la confirmación
  deberá coincidir (validación Zod).
- REC-06: La página /login tendrá un link "¿Olvidaste tu contraseña?" que
  enlaza a /recuperar.
- REC-07: Si el link de recuperación ha expirado o es inválido, el sistema
  deberá mostrar un mensaje de error y link para pedir uno nuevo.

## Criterios de aceptación
- [x] GET /recuperar muestra formulario de email.
- [x] Submit con email válido → redirect a /recuperar/enviado + Mailpit recibe link.
- [x] Submit con email inexistente → mismo mensaje genérico (no revela).
- [x] Click en link del email → redirect a /recuperar/confirmar con sesión.
- [x] Submit nueva password válida → updateUser + redirect a /login.
- [x] Login con nueva password funciona; con la antigua falla.
- [x] Password < 8 chars o confirmación no coincide → error Zod.
- [x] /login tiene link "¿Olvidaste tu contraseña?".
- [x] Link expirado/inválido → mensaje de error + link para pedir nuevo.
- [x] Tests de servidor: pedir recuperación, email inexistente, cambiar password.
- [x] Test E2E: flujo completo (pedir → link → cambiar → login).
- [x] ./validate.sh en verde.

## Fuera de alcance
- Configuración de SMTP real para producción (follow-up de despliegue)
- Recuperación vía SMS o métodos alternativos
- Cambio de email (eso es F015)
- 2FA (follow-up)
- Personalización del template del email
