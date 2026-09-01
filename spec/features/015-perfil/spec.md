# 015 — Edición de perfil

## Contexto
Feature L2. Permite al usuario editar su perfil: cambiar password (con
reautenticación), cambiar email (con confirmación vía link), y cambiar
display_name. Requiere migración M10 para añadir display_name a usuario.

## Rutas
- `/perfil`: sección "Editar perfil" integrada en la página existente.

## Requisitos (EARS)
- PER-01: Cuando un usuario autenticado introduce su password actual correcta
  y una nueva password válida (min 8 chars), el sistema deberá cambiar la
  password y mostrar confirmación.
- PER-02: Cuando un usuario introduce un password actual incorrecto, el
  sistema deberá rechazar con error "Password actual incorrecta".
- PER-03: Cuando un usuario introduce un nuevo email válido, el sistema deberá
  enviar un link de confirmación al nuevo email (vía Mailpit en local) y
  mostrar mensaje genérico (no revelar si el email ya existe).
- PER-04: Cuando el usuario confirma el nuevo email vía el link, el sistema
  deberá actualizar el email en auth.users. Mientras no se confirme, el email
  antiguo sigue activo.
- PER-05: Cuando un usuario introduce un display_name válido (3-50 chars), el
  sistema deberá actualizar usuario.display_name y mostrarlo en /perfil.
- PER-06: La sección "Editar perfil" estará visible solo para usuarios
  autenticados (requireUser).

## Criterios de aceptación
- [ ] Usuario cambia password con password actual correcta → login con nueva funciona.
- [ ] Usuario cambia password con password actual incorrecta → error.
- [ ] Usuario cambia email → Mailpit recibe link de confirmación.
- [ ] Usuario confirma nuevo email → login con nuevo email funciona.
- [ ] Usuario cambia display_name → visible en /perfil.
- [ ] Sin sesión en /perfil → redirect a /login.
- [ ] Tests de servidor: cambiarPassword, cambiarEmail, cambiarDisplayName.
- [ ] Test E2E: flujo completo (password, email, display_name).
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Avatar de usuario (upload de imagen)
- Biografía / descripción de usuario
- Historial de actividad en /perfil (eso es F016)
- Eliminación de cuenta
- 2FA
