# 014 — Recuperación de password · Tareas

- [ ] T1 — Servicios + schemas en lib/auth.ts + tests de servidor
  lib/auth.ts (extender, no crear de nuevo): schemas Zod `recuperarSchema`
  (email válido) y `nuevaPasswordSchema` (password min 8 + confirmación
  coincide). Constantes ERRORES_AUTH: `mensajeRecuperacionEnviado` (texto
  genérico "Si existe una cuenta con ese email, te hemos enviado un link") y
  `cambiarPasswordOk` (para el banner). Servicios inyectables (patrón F008):
  `solicitarRecuperacion(client, email)` → client.auth.resetPasswordForEmail(
  email, { redirectTo: <origin>/auth/reset }) — no lanza si el email no
  existe (anti-enumeración de GoTrue); si lanza (rate limit/red), re-lanza
  con el mensaje genérico · `restablecerPassword(client, password)` →
  client.auth.updateUser({ password }).
  Helper `origin()`: NEXT_PUBLIC_SITE_URL ?? http://127.0.0.1:3000 en dev; el
  route handler usa el origin derivado de headers.
  tests/db/recuperacion.test.ts (nuevo, patrón auth.test.ts: clientes planos
  persistSession:false + vi.hoisted env + cleanup cascade):
  - solicitarRecuperacion(email válido) → no lanza y el correo aparece en
    Inbucket (consultar API de Inbucket en el test).
  - solicitarRecuperacion(email inexistente) → no lanza y NO aparece correo
    en Inbucket; mismo comportamiento observable (mensaje genérico).
  - restablecerPassword del flujo completo: obtener link de Inbucket →
    intercambiar code (cliente plano, exchangeCodeForSession) →
    restablecerPassword(nueva) → login con nueva OK y con antigua falla.
  - Zod: password <8 chars y confirmación distinta → issues.
  Criterio: npm test -- --run verde (BD local arriba).

- [ ] T2 — Route handler callback + Server Actions
  app/auth/reset/route.ts (nuevo): GET con searchParams { code } ·
  createAuthClient() (cookies) · client.auth.exchangeCodeForSession(code) ·
  redirect a /recuperar/confirmar; si el intercambio falla (code inválido/
  expirado) → redirect a /recuperar/confirmar?error=link-invalido (REC-07).
  lib/auth-actions.ts (extender, "use server"):
  - `accionPedirRecuperacion(prevState, formData)`: Zod recuperarSchema
    (campoTexto email, trim) → createAuthClient → solicitarRecuperacion →
    redirect('/recuperar/enviado'). En fallo de Zod → { error }; en fallo del
    servicio → devuelve SIEMPRE el mensaje genérico (REC-01, no revela).
  - `accionConfirmarRecuperacion(prevState, formData)`: Zod nuevaPasswordSchema
    (nueva + confirmación) → createAuthClient → restablecerPassword →
    redirect('/login?msg=<cambiarPasswordOk>'). En fallo (sesión de recovery
    inexistente/expirada) → { error } amigable + enlace a /recuperar.
  Criterio: lint + typecheck + build verdes; smoke manual en dev (pedir →
  ver el link en Inbucket → abrirlo → cambiar → login).

- [ ] T3 — Páginas + componentes + link en /login
  components/recuperar-form.tsx (nuevo, "use client"): useActionState(
  accionPedirRecuperacion) · input email · error role=alert · botón pending
  "Enviar link" (patrón login-form.tsx).
  components/reset-password-form.tsx (nuevo, "use client"): useActionState(
  accionConfirmarRecuperacion) · password + confirmación (name nuevaPassword /
  confirmacion) · hint min 8 · error role=alert · botón pending
  "Cambiar contraseña".
  app/recuperar/page.tsx (nuevo, RSC, metadata "Recuperar contraseña"):
  RecuperarForm + texto aviso.
  app/recuperar/enviado/page.tsx (nuevo, RSC estático, metadata "Revisa tu
  email"): texto genérico + enlace a /login.
  app/recuperar/confirmar/page.tsx (nuevo, RSC, metadata "Nueva contraseña"):
  lee searchParams.error (Promise, Next 16) → si error → banner (role=status)
  + enlace a /recuperar (REC-07); renderiza ResetPasswordForm.
  app/login/page.tsx (modificar, REC-06): párrafo con link
  "¿Olvidaste tu contraseña?" → /recuperar junto al párrafo de /registro.
  Criterio: lint + typecheck + build verdes; smoke manual en dev.

- [ ] T4 — E2E Playwright
  e2e/recuperacion.spec.ts (nuevo; usuario único por ejecución; cleanup
  deleteAuthUserByEmail → cascade).
  Helper (inline o e2e/helpers.ts): leer correos de Inbucket
  GET http://127.0.0.1:54324/api/v1/mailbox/<email>, esperar (poll con
  timeout) al último correo de recuperación y extraer del body HTML el href
  del link que apunta a /auth/reset.
  Tests:
  - Flujo completo en un test() (cookies compartidas): /login → link
    "¿Olvidaste tu contraseña?" → /recuperar → submit email → /recuperar/
    enviado → leer link de Inbucket → goto link (callback intercambia code) →
    /recuperar/confirmar → nueva password (min 8) → /login?msg=… → login con
    nueva password OK (llega a /perfil) → logout → login con antigua password
    falla.
  - REC-01: /recuperar con email inexistente → misma pantalla /enviado (no
    revela si existe).
  Criterio: npm run test:e2e verde; auth/catalogo/ficha/canal sin regresiones.

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada) · ROADMAP.md (014 ✅, nueva
  fila) · docs/memory/session-log.md (sesión F014) · commit atómico `F14: …`
  tras revisión del diff (DoD #4).
  Criterio: Definition of Done completa.
