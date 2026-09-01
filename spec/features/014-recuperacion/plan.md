# 014 — Recuperación de password · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Flujo técnico: nativo de Supabase GoTrue (resetPasswordForEmail + updateUser).
2. Rutas: /recuperar · /recuperar/enviado · /recuperar/confirmar.
3. Seguridad: mensaje genérico SIEMPRE (no revelar si el email existe, evita
   enumeración). El success y el inexistente muestran el mismo texto.
4. Punto de entrada: link "¿Olvidaste tu contraseña?" bajo el form de /login.
5. Email en local: Mailpit (puerto 54324, el SMTP local de supabase start).
6. Tests: pedir recuperación válido, email inexistente (mismo mensaje),
   cambiar password vía link, E2E completo.
7. NO requiere migración (usa auth.users de GoTrue).

## Decisiones técnicas (justificadas)

1. **Route handler de callback (PKCE) — detalle clave.** El link que genera
   GoTrue NO apunta a /recuperar/confirmar directamente: apunta a una URL de
   callback (vía `redirectTo` en resetPasswordForEmail) que contiene el
   `code` de recuperación. Necesitamos un route handler
   `app/auth/reset/route.ts` que:
   - reciba `?code=...` (y posiblemente `next`),
   - cree el cliente auth con cookies (createAuthClient de lib/auth.ts),
   - intercambie el code por sesión con `exchangeCodeForSession(code)`
     (flujo PKCE de supabase-js v2 / @supabase/ssr),
   - y redirija a `/recuperar/confirmar`.
   Con el code intercambiado, la sesión queda fijada vía cookies; luego
   `updateUser({ password })` funciona en /recuperar/confirmar porque el
   usuario está autenticado con esa sesión de recovery.
   Si el code es inválido/expirado → redirect a /recuperar/confirmar?error=1
   (REC-07) o a /recuperar con error. Decisión: redirigir a
   `/recuperar/confirmar?error=link-invalido`, y la página muestra el mensaje
   de error y un enlace a /recuperar para pedir uno nuevo.
2. **redirectTo en local.** En resetPasswordForEmail pasamos
   `redirectTo: <origin>/auth/reset`. En local el origin es
   http://127.0.0.1:3000 (site_url de supabase/config.toml). Para no
   hardcodear el puerto, derivamos el origin de headers o de
   process.env.NEXT_PUBLIC_SITE_URL. Nota: la configuración GoTrue lista
   URLs permitidas en site_url + additional_redirect_urls
   (config.toml:159,163); el redirectTo DEBE estar en esa lista (ya lo está
   en local: site_url=http://127.0.0.1:3000).
3. **Servicios inyectables** (patrón F008/F009/F012/F013), en lib/auth.ts:
   - `solicitarRecuperacion(client, email)` → `client.auth.resetPasswordForEmail(
     email, { redirectTo })`. Si email es desconocido GoTrue NO devuelve error
     (anti-enumeración por diseño): anti-enumeración se refuerza con el mensaje
     genérico en la action (REC-01).
   - `restablecerPassword(client, password)` → `client.auth.updateUser({
     password })`. Requiere sesión de recovery activa (la del callback).
   - Nuevo schema Zod `recuperarSchema` (email válido) y
     `nuevaPasswordSchema` (password min 8 + confirmación que coincide).
4. **Server Actions** (lib/auth-actions.ts, "use server"):
   - `accionPedirRecuperacion(prevState, formData)`: Zod email. Llama
     `solicitarRecuperacion`. En éxito `redirect('/recuperar/enviado')`. En
     fallo de ZOD devuelve { error }; si el servicio lanza (rareza, p.ej.
     rate limit), devuelve el mensaje genérico de todos modos para no revelar
     existencia (REC-01). El text genérico vive en un constant
     `ERRORES_AUTH.mensajeRecuperacionEnviado`.
   - `accionConfirmarRecuperacion(prevState, formData)`: Zod nuevaPassword
     (min 8 + confirmación coincidente). Llama `restablecerPassword` → en
     éxito `redirect('/login?msg=Contraseña actualizada correctamente')`
     (reutiliza el banner status de /login). En fallo devuelve { error }.
   - `accionLogout` reutilizada; no se toca el resto de actions.
5. **Páginas RSC (español, metadata):**
   - `app/recuperar/page.tsx`: form de email (RecuperarForm). Si hay sesión
     activa NO se bloquea (a diferencia de /login, una sesión no impide pedir
     reset; GoTrue igualmente solo envía por email). No se usa requireUser.
   - `app/recuperar/enviado/page.tsx`: página estática "Revisa tu email" con
     el texto del mensaje genérico y enlace a /login.
   - `app/recuperar/confirmar/page.tsx`: form de nueva password
     (ResetPasswordForm). Lee `searchParams.error` (REC-07) para mostrar
     mensaje de link inválido/expirado + enlace a /recuperar. La acción
     confirmar valida la sesión vía GoTrue (si no hay sesión de recovery,
     updateUser falla → error amigable + enlace a /recuperar).
6. **Componentes cliente ("use client", useActionState + error role=alert +
   pending):** `components/recuperar-form.tsx` (email, sin preservar valor en
   fallo porque siempre redirige a /enviado) y
   `components/reset-password-form.tsx` (password + confirmación, con hint de
   min 8). Patrón exacto de login-form.tsx.
7. **/login (REC-06):** añadir bajo el form un párrafo con el link
   "¿Olvidaste tu contraseña?" → /recuperar (junto al párrafo cruzado a
   /registro existente).
8. **Tests de servidor** (tests/db/recuperacion.test.ts, patrón auth.test.ts,
   clientes planos persistSession:false + vi.hoisted env):
   - `solicitarRecuperacion` con email válido → no lanza y GoTrue guarda el
     correo (se verifica consultando Mailpit API o que no hay error); mejor:
     verificar que un email llega a Mailpit.
   - `solicitarRecuperacion` con email inexistente → no lanza y NO se envía
     correo (Mailpit vacío para ese destinatario) — mismo comportamiento
     observable desde la action (mensaje genérico).
   - `restablecerPassword` fluido completo: para hacerlo determinista se
     obtiene el link de Mailpit, se intercambia el code con un cliente
     (exchangeCodeForSession) y se llama restablecerPassword; luego login con
     la nueva password OK y con la antigua falla.
   - Zod: nuevaPassword < 8 chars y confirmación distinta → issues.
9. **E2E Playwright** (e2e/recuperacion.spec.ts):
   - Helper para leer el último email de recuperación de un destinatario vía
     API de Mailpit (http://127.0.0.1:54324) y extraer el link
     (href al /auth/reset...).
   - Flujo completo en un `test()` (cookies compartidas): crear usuario →
     /recuperar → submit email → /recuperar/enviado → leer link de Mailpit →
     goto link (callback intercambia sesión) → /recuperar/confirmar → nueva
     password → /login → login con nueva password OK; login con antigua falla.
   - Test: /recuperar con email inexistente → misma pantalla /enviado (no
     revela). — se puede cubrir en el mismo flujo o test separado.
10. **No se toca** lib/supabase.ts (el reset usa el cliente auth con cookies),
    ni el header, ni RLS, ni migraciones, ni types/database.ts.

## Contexto del repo (hallazgos de planificación)
- GoTrue local (config.toml): site_url=http://127.0.0.1:3000 ·
  additional_redirect_urls=[https://127.0.0.1:3000] · enable_confirmations
  =false · secure_password_change=false (updateUser sin reauth) ·
  max_frequency="1s" (rate limit de emails, bueno para tests) ·
  local_smtp habilitado en puerto 54324 (Mailpit).
- @supabase/ssr ^0.12.5 + supabase-js ^2.112.4 ya instalados (F008). No hay
  dependencias nuevas.
- No existe ningún app/auth/ ni route handler hoy (F008 lo anotó como
  pendiente: los tokens de callback no se procesan con searchParams de página
  en Next; hace falta route handler). createAuthClient() ya gestiona cookies
  vía getAll/setAll (listo para exchangeCodeForSession).
- Patrones de acción → servicio → cliente inyectable, Zod inline,
  useActionState, banner msg en /login, Mailpit ya usado en desarrollo:
  todo reutilizable.
- E2E: workers=1, webServer `npm run build && npm start`, global-setup templa
  GoTrue; helpers createAuthUser/deleteAuthUser/deleteAuthUserByEmail/
  TEST_PASSWORD disponibles. El wipe() no toca auth.users.
- El login con /login?msg=… muestra banner role="status" (AUTH-06) →
  reutilizable para "Contraseña actualizada" (evita revelar / sin página extra).

## Orden de tareas (una sesión de Build por tarea)

### T1 — Servicios + schemas en lib/auth.ts + tests de servidor
- lib/auth.ts (extender, no crear de nuevo): schemas `recuperarSchema`
  (email válido) y `nuevaPasswordSchema` (password min 8 + confirmación
  coincide); constantes `ERRORES_AUTH.mensajeRecuperacionEnviado` (texto
  genérico) y `ERRORES_AUTH.cambiarPasswordOk` (para el banner → ocupa también
  /enviado). Servicios inyectables:
  - `solicitarRecuperacion(client, email)` → resetPasswordForEmail(email,
    { redirectTo: <origin>/auth/reset }). No lanza si email no existe
    (GoTrue anti-enumeración); si lanza (rate limit/red), re-lanza con mensaje
    genérico.
  - `restablecerPassword(client, password)` → updateUser({ password }).
- Helper `origin()`: devuelve process.env.NEXT_PUBLIC_SITE_URL ?? (para dev
  http://127.0.0.1:3000) o el derivado de headers en el route handler.
- tests/db/recuperacion.test.ts (nuevo, patrón auth.test.ts):
  - solicitarRecuperacion(email válido) → no lanza; el email aparece en
    Mailpit (consulta API de Mailpit).
  - solicitarRecuperacion(email inexistente) → no lanza; no aparece correo en
    Mailpit; mismo comportamiento observable.
  - restablecerPassword del flujo completo: tomar link de Mailpit →
    intercambiar code (cliente plano) → restablecerPassword(nueva) → login
    nueva OK, antigua falla.
  - Zod: password <8 y confirmación distinta → issues.
- Criterio: npm test -- --run verde (BD local arriba).

### T2 — Route handler callback + Server Actions
- app/auth/reset/route.ts (nuevo): GET con searchParams { code, next } ·
  createAuthClient() · exchangeCodeForSession(code) · redirige a
  /recuperar/confirmar (o ?error=1 si el intercambio falla → REC-07).
- lib/auth-actions.ts (extender):
  - `accionPedirRecuperacion(prevState, formData)`: Zod email →
    createAuthClient → solicitarRecuperacion → redirect('/recuperar/enviado');
    siempre mismo mensaje (no revela) en cualquier fallo.
  - `accionConfirmarRecuperacion(prevState, formData)`: Zod nuevaPassword →
    createAuthClient → restablecerPassword → redirect('/login?msg=…'); en
    fallo devuelve { error } (link expirado/sesión inexistente → error amigable
    + el form ofrece enlace a /recuperar).
- Criterio: lint + typecheck + build verdes; smoke manual en dev con Mailpit.

### T3 — Páginas + componentes + link en /login
- components/recuperar-form.tsx (nuevo, "use client"): useActionState(
  accionPedirRecuperacion), input email, error role=alert, pending, botón
  "Enviar link".
- components/reset-password-form.tsx (nuevo, "use client"): useActionState(
  accionConfirmarRecuperacion), password + confirmación, hint min 8, error
  role=alert, pending, botón "Cambiar contraseña".
- app/recuperar/page.tsx (nuevo, RSC, metadata "Recuperar contraseña"):
  renderiza RecuperarForm → texto de aviso "Introduce tu email y te enviaremos
  un link".
- app/recuperar/enviado/page.tsx (nuevo, RSC, estática, metadata "Revisa tu
  email"): muestra el mensaje genérico + enlace a /login.
- app/recuperar/confirmar/page.tsx (nuevo, RSC, metadata "Nueva contraseña"):
  lee searchParams.error (REC-07) → banner de error + enlace a /recuperar;
  renderiza ResetPasswordForm.
- app/login/page.tsx (modificar, REC-06): añadir párrafo con link
  "¿Olvidaste tu contraseña?" → /recuperar (junto al párrafo de /registro).
- Criterio: lint + typecheck + build verdes; smoke manual en dev.

### T4 — E2E Playwright
- e2e/helpers.ts (nuevo) o inline en el spec: leer correos de Mailpit
  (GET http://127.0.0.1:54324/api/v1/search?query=to:<email> +
  /api/v1/message/<id>) y extraer el href del
  link /auth/reset del body HTML del último correo.
- e2e/recuperacion.spec.ts (nuevo): usuario único por ejecución + cleanup
  deleteAuthUserByEmail → cascade:
  - Flujo completo en un test: /login → link "¿Olvidaste tu contraseña?" →
    /recuperar → submit email → /recuperar/enviado → leer link de Mailpit →
    goto link (intercambio de code) → /recuperar/confirmar → nueva password →
    /login?msg → login con nueva password OK; login con antigua falla.
  - /recuperar con email inexistente → misma pantalla /enviado (REC-01, no
    revela) — test separado (puede compartir contexto o no; al no haber
    sesión, contexto nuevo basta).
- Criterio: npm run test:e2e verde; auth/catalogo sin regresiones.

### T5 — validate.sh + cierre
- ./validate.sh completo (salida real pegada).
- ROADMAP.md: 014 ✅ (nueva fila). docs/memory/session-log.md: sesión F014.
- Commit atómico `F14: …` tras revisión del diff (DoD #4).

## Archivos
**Crear**
- spec/features/014-recuperacion/{spec.md,plan.md,tasks.md}
- app/auth/reset/route.ts (callback GoTrue, PKCE)
- app/recuperar/page.tsx · app/recuperar/enviado/page.tsx ·
  app/recuperar/confirmar/page.tsx
- components/recuperar-form.tsx · components/reset-password-form.tsx
- tests/db/recuperacion.test.ts · e2e/recuperacion.spec.ts

**Modificar**
- lib/auth.ts (schemas + servicios de recuperación)
- lib/auth-actions.ts (accionPedirRecuperacion, accionConfirmarRecuperacion)
- app/login/page.tsx (link "¿Olvidaste tu contraseña?")
- Al cierre: ROADMAP.md · docs/memory/session-log.md

## Riesgos técnicos
- **PKCE de supabase-js v2**: el callback debe usar exchangeCodeForSession(code)
  con el cliente @supabase/ssr de cookies; si el code no se intercambia antes
  de que expiren las cookies/el code, falla → REC-07. El template por defecto
  de GoTrue ya genera el PKCE (code) para supabase-js v2.
- **redirectTo en local**: debe ser una URL permitida por GoTrue
  (site_url/additional_redirect_urls). En local es http://127.0.0.1:3000;
  derivar origin de la request (headers) o env para no hardcodear.
- **Sesión de recovery**: updateUser({ password }) requiere la sesión de
  recovery activa. Si el usuario llega a /recuperar/confirmar por URL directa
  sin sesión, updateUser falla → se muestra error + enlace a /recuperar
  (cubierto por el form y el E2E).
- **Anti-enumeración**: reforzada a dos niveles — GoTrue (sin error en email
  inexistente) + action que devuelve SIEMPRE el mismo mensaje genérico
  (REC-01), incluso ante fallos de red/rate-limit.
- **Mailpit en E2E**: el email puede tardar un instante en aparecer; el helper
  debe esperar/poll. max_frequency="1s" de GoTrue limita emails repetidos. Si
  tarda, retry con timeout.
- **Expiración del link**: por defecto GoTrue (1h) + jwt_expiry=3600. Para el
  E2E el flujo es inmediato, no expira; REC-07 se cubre probando un code
  inválido.
- **messages**: el texto genérico debe ser exactamente el de REC-01.

## Qué NO haré (fuera de alcance)
- SMTP real de producción (follow-up de despliegue) · recuperación por SMS u
  otros métodos · cambio de email (F015) · 2FA · personalización del template
  de email de GoTrue.
- Migraciones (usa auth.users existente) · tocar types/database.ts ·
  lib/supabase.ts · header · seed · RLS.
- Cambiar el mensaje de error/éxito a textos específicos que revelen
  existencia de email.
