# F015 — Edición de perfil: plan técnico

## Resumen
Add una sección "Editar perfil" en /perfil con tres sub-secciones (password,
email, display_name). Cambio de password exige reautenticación con la actual
(vía signInWithPassword). Cambio de email usa el flujo nativo de GoTrue
(updateUser({email}) → link de confirmación). display_name es nueva columna
TEXT NULL en public.usuario (M10). Todo resuelto con servicios inyectables en
lib/ + Server Actions con Zod + formularios cliente, siguiendo el patrón de
F014 (auth.ts / auth-actions.ts / reset-password-form.tsx).

## Decisiones confirmadas (Build)
- **double_confirm_changes = false** en config.toml: el cambio de email solo
  exige confirmar el email NUEVO (coherente con PER-03/04). El antiguo deja de
  requerir confirmación.
- Nota: `secure_password_change = false` (config.toml): GoTrue NO exige reauth
  para updateUser({password}); la reautenticación se implementa a nivel app con
  signInWithPassword ANTES de updateUser (requisito del usuario, PER-01/02).
- Convención de no-comentarios en código (AGENTS.md). Solo comentarios donde el
  patrón existente ya los usa (p. ej. por qué el reauth con signInWithPassword).

## Hallazgos del repo (confirmados)
- `usuario_update_own` (M3, rls_and_triggers.sql:121-123) ya permite el UPDATE
  de la fila propia (`using/with check: id = auth.uid()`). Añadir display_name
  NO requiere política nueva. El trigger `prevent_self_role_escalation` solo se
  dispara cuando cambia `rol` (M3:31-34), así que escribir display_name no se
  bloquea. → No hay que tocar RLS.
- `usuario_select_own` (M7) restringe el SELECT a la fila propia; /perfil ya
  consulta su propia fila. OK.
- `enable_confirmations = false` (config.toml:228): registro sin confirmación,
  coherente con F014.
- Comando types: `npm run gen:types` (package.json:14) regenera types/database.ts.

## Orden de tareas atómicas (una sesión de Build por tarea)

### T1 — Migración M10 + regenerar tipos
- Nuevo archivo `supabase/migrations/<timestamp>_add_usuario_display_name.sql`.
- `alter table public.usuario add column display_name text;`
- CHECK de longitud (columna nullable, CHECK solo cuando no null):
  ```sql
  alter table public.usuario add column display_name text;
  alter table public.usuario add constraint usuario_display_name_len
    check (display_name is null or char_length(display_name) between 3 and 50);
  ```
- Verificado: `usuario_update_own` ya cubre el update (no requiere ajuste RLS).
- Comandos: `supabase db reset` + `npm run gen:types` (añade `display_name:
  string | null` a usuario Row/Insert/Update en types/database.ts).

### T2 — Servicios en lib/auth.ts (inyectables)
Todos reciben `client: AuthClient` (mismo patrón que F014).
- `cambiarPassword(client, passwordActual, passwordNueva)`:
  1. reauth: `signInWithPassword({ email, password: passwordActual })` → si
     error ⇒ throw `ERRORES_AUTH.passwordActualIncorrecta` (PER-02). El email
     se lee de `client.auth.getUser()` (sesión activa).
  2. `updateUser({ password: passwordNueva })` → error ⇒ throw.
- `cambiarEmail(client, nuevoEmail)`:
  `updateUser({ email: nuevoEmail })`. GoTrue manda link al nuevo email. Devuelve
  mensaje genérico SIEMPRE, no revela existencia del email (PER-03 anti-
  enumeración). Con `double_confirm_changes=false`, basta confirmar el nuevo
  email.
- `cambiarDisplayName(client, displayName)`:
  `update('usuario').update({ display_name }).eq('id', <userId>)`. El userId se
  obtiene de `getUser()` (la fila propia, RLS lo permite).
- Añadir esquemas Zod y constantes a ERRORES_AUTH:
  - `cambiarPasswordSchema` (passwordActual, passwordNueva min 8, confirmacion
    que coincide) — reutiliza patrón nuevaPasswordSchema.
  - `cambiarEmailSchema` (email válido).
  - `cambiarDisplayNameSchema` (3-50 chars).
  - `ERRORES_AUTH.passwordActualIncorrecta`, `mensajeEmailCambioEnviado`,
    `displayNameOk`.

### T3 — Server Actions en lib/auth-actions.ts
Cada una: getUser (identidad) + Zod + `revalidatePath('/perfil')`, patrón de
F014. Devuelven `AuthFormState` (`{ error? }` o `{ ok?: string }`).
- `accionCambiarPassword` (PER-01/02): valida schema → crear client →
  `cambiarPassword(client, current, new)` → `revalidatePath('/perfil')` →
  devolver `{ ok }`. En fallo devolver `{ error }`.
- `accionCambiarEmail` (PER-03): valida → `cambiarEmail` → revalidatePath →
  devolver mensaje genérico.
- `accionCambiarDisplayName` (PER-05): valida → `cambiarDisplayName` →
  revalidatePath → devolver ok.
- La página /perfil ya aplica requireUser (AUTH-06) como guard principal; las
  actions derivan la identidad de la sesión activa (getUser).

### T4 — UI en app/perfil/page.tsx
- Añadir en `getPerfilData` la lectura de `display_name` (PerfilData amplía con
  `display_name: string | null`).
- Mostrar display_name en "Datos de la cuenta".
- Nueva sección "Editar perfil" tras "Datos de la cuenta", con tres
  sub-secciones que montan los tres formularios cliente.

### T5 — Formularios cliente (components/)
- `cambiar-password-form.tsx`
- `cambiar-email-form.tsx`
- `cambiar-displayname-form.tsx`
- Patrón "use client": `useActionState`, `error role="alert" `, `pending`, inputs
  no controlados (idéntico a reset-password-form.tsx / login-form.tsx).
- Display_name muestra estado ok (PER-05 confirmación).

### T6 — Tests de servidor
Nuevo `tests/db/perfil.test.ts` (patrón tests/db/recuperacion.test.ts + env.ts):
- cambiarPassword: reauth OK + login con nueva funciona / antigua falla.
- cambiarPassword: password actual incorrecta → error PER-02.
- cambiarEmail: Mailpit recibe link de confirmación al nuevo email (helper
  readMailpit como readResetToken).
- cambiarEmail → confirmar link → login con nuevo email / falla el antiguo.
- cambiarDisplayName: update usuario.display_name y lectura con RLS propia.
- Zod: min 8 password, 3-50 display_name, formato email.

### T7 — Test E2E Playwright
Nuevo `e2e/perfil.spec.ts` (patrón e2e/auth.spec.ts + global-setup):
- Flujo completo en un solo test (contexto de sesión):
  1. Registrar/crear usuario.
  2. Cambiar password (reauth) → logout → login con la nueva.
  3. Cambiar email → confirmar vía Mailpit (helper getEmailChangeLink) → login
     con el nuevo email.
  4. Cambiar display_name → visible en /perfil.
- Sin sesión en /perfil → redirect a /login (PER-06).

### T8 — Puerta final
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run test:e2e`.
- `./validate.sh` (única puerta).
- Actualizar DECISIONS.md si aflora un ADR (p. ej. constancia del email change
  con double_confirm desactivado y el cambio de password con reauth app-level).

## Archivos a crear
- supabase/migrations/<ts>_add_usuario_display_name.sql
- components/cambiar-password-form.tsx
- components/cambiar-email-form.tsx
- components/cambiar-displayname-form.tsx
- tests/db/perfil.test.ts
- e2e/perfil.spec.ts

## Archivos a modificar
- lib/auth.ts (servicios + esquemas + ERRORES_AUTH + PerfilData.display_name)
- lib/auth-actions.ts (3 Server Actions)
- app/perfil/page.tsx (sección "Editar perfil" + mostrar display_name)
- types/database.ts (regenerado por gen:types)
- supabase/config.toml (double_confirm_changes = false)
- DECISIONS.md / ROADMAP.md (si procede)

## Riesgos técnicos
1. **Reauth de password**: con `secure_password_change=false`, GoTrue no obliga;
   la verificación es nuestra (signInWithPassword). El signInWithPassword con
   sesión activa refresca/valida la sesión — hay que garantizar que la sesión
   del usuario siga válida tras el reauth (probarlo en T6/T7).
2. **Flujo email change de GoTrue**: con `double_confirm_changes=false` solo se
   confirma el email nuevo. Validar en T6/T7 que el antiguo deja de ser el
   activo tras confirmar el nuevo.
3. **RLS display_name**: ya cubierto por usuario_update_own. Sin riesgo.
4. **Mailpit para confirmación de email**: el link de confirmación de email
   cambia respecto al de recovery (subject/estructura distintos). Extraer un
   helper de lectura de Mailpit por subject tipo "Confirm change of email".
5. **Mensaje genérico anti-enumeración en email**: GoTrue hace updateUser
   idempotente; devolver siempre el mismo mensaje (PER-03).

## Qué NO harás (fuera de alcance)
- Cambiar el flujo de registro/login existente.
- Añadir avatar, biografía, eliminación de cuenta o 2FA (spec: fuera de alcance).
- Crear rutas nuevas (todo va en /perfil).
- Añadir dependencias nuevas (no hacen falta) ni migraciones sin aprobación
  (M10 ya está aprobada).
- No editar migraciones M1-M9.
