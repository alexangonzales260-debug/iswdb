# 008 — Login/Registro · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Proveedor: solo email/password (sin OAuth).
2. UI: páginas dedicadas /login y /registro (sin modales).
3. Rutas protegidas: solo escritura requiere login; catálogo público anónimo.
4. Gestión de sesión: header con avatar/email + logout, y página /perfil.
5. Usuarios seed NO pueden hacer login (son sintéticos, encrypted_password
   vacío en supabase/seed.sql).

## Decisiones técnicas (justificadas)
1. **Server Actions, no route handlers** (D6: UI → Server Actions → lib/).
   No se necesita superficie API REST; las actions viven en
   lib/auth-actions.ts ("use server"). Los formularios de login/registro son
   componentes cliente con useActionState (React 19) para cumplir AUTH-02
   literal ("muestra error sin redirigir"): la action devuelve { error } como
   estado, sin navegación PRG. Logout es un <form action> RSC puro en el
   header (cero JS cliente).
2. **Sin middleware/proxy**: guard a nivel de página con requireUser() de
   lib/auth.ts. getUser() es una llamada verificada a GoTrue (no
   decodificación local de JWT); Next 16 depreca middleware.ts en favor de
   proxy.ts y añadiría un segundo mecanismo para lo mismo. Un solo mecanismo
   cubre /perfil (AUTH-03), AUTH-05 y AUTH-06.
3. **Servicios inyectables**: registrarUsuario(client, email, password),
   iniciarSesion(client, email, password), etc. reciben el cliente Supabase
   por parámetro. Las actions pasan el cliente con cookies; vitest pasa
   clientes planos (persistSession: false) → los flujos se testean sin
   request context de Next (patrón de tests/db/rls.test.ts).
4. **Signup duplicado**: con enable_confirmations=false
   (supabase/config.toml), GoTrue no da error con email existente
   (anti-enumeración): devuelve 200 con identities: []. Detección:
   identities.length === 0 → "Ya existe una cuenta con este email".
5. **Self-healing de public.usuario**: getPerfilData() inserta la fila si no
   existe (ignorando 23505), cubriendo el edge de signUp OK + insert
   fallido. El insert usa el cliente con sesión (RLS usuario_insert_own:
   id = auth.uid()).
6. **Avatar**: círculo con la inicial del email (sin Storage ni
   dependencias; consistente con los placeholders de avatares de canal).
7. **listMisValoraciones** (lib/valoraciones.ts) usa el cliente anon
   existente (lib/supabase.ts): el SELECT de valoracion es público (D11,
   valoracion_select_public) y basta .eq('user_id', userId) server-side +
   embed serie(titulo, slug), orden created_at desc.
8. **Mecanismo AUTH-06**: requireUser({ next, message }) → redirect
   /login?next=<path>&msg=<texto>. /login pinta banner si hay msg y tras el
   login redirige a next (validado /^\/(?!\/)/ → sin open redirect). F009 lo
   consumirá para valorar; F008 testea el mecanismo directamente.
9. **Confirmación de registro** (AUTH-01): redirect /perfil?bienvenida=1 →
   banner "Cuenta creada correctamente".
10. **shadcn input/label**: `npx shadcn add input label` copia
    components/ui/{input,label}.tsx (D14: componentes copiados; radix-ui ya
    está instalado). Si el comando intentara instalar dependencias nuevas,
    paro y pregunto.
11. **getUser() envuelto en cache() de React**: layout (header) y página lo
    llaman; deduplica el round-trip a GoTrue por request.

## Contexto del repo (hallazgos de planificación)
- **Sin migraciones**: public.usuario ya existe (F002 M2: id → auth.users on
  delete cascade, rol check user/mod/admin default 'user') con RLS completo
  (select authenticated, insert/update own + trigger anti-escalada,
  migración 20260826162336). types/database.ts ya incluye usuario/valoracion.
- **GoTrue local**: enable_signup=true, enable_confirmations=false (signup da
  sesión inmediata), minimum_password_length=6 (Zod exigirá 8 por AUTH-01),
  jwt_expiry=3600, rate limit sign_in_sign_ups=30/5min.
- **lib/supabase.ts**: cliente server anon para el catálogo; el comentario de
  la línea 14 anticipa el cliente con cookies de F008 → vive en lib/auth.ts;
  lib/supabase.ts no se toca.
- **Helpers existentes**: tests/db/env.ts tiene createTestUser/
  deleteTestUser/signInTestUser (GoTrue admin, retry en frío).
  e2e/global-setup.ts tiene createAuthUser/deleteAuthUser privados → se
  exportan para el cleanup del E2E de auth.
- **Cascada**: borrar un auth user elimina su fila de public.usuario y sus
  valoraciones (FK on delete cascade) → cleanup simple en tests/E2E.
- **Header**: app/layout.tsx es RSC; el header inline se sustituye por
  components/header.tsx (async, await getUser()). Las páginas ya son
  force-dynamic; durante next build no hay cookies → getUser() devuelve null
  y el build no depende del stack.
- **Next 16**: searchParams es Promise en page props (patrón
  app/series/page.tsx:13).
- **E2E**: workers=1, webServer `npm run build && npm start` (build de
  producción: las server actions funcionan); global-setup ya templa GoTrue
  con la API de admin antes de los flujos de navegador.
- **ROADMAP.md:10** dice "Autenticación (email + OAuth Google)" → se corrige
  a "email + password" en el cierre (decisión 1).
- **@supabase/ssr no está instalado** (verificado node_modules/@supabase).
  Instalación aprobada como parte de F008.

## Orden de tareas (una sesión de Build por tarea)

### T1 — lib/auth.ts + lib/valoraciones.ts + tests de servidor
- npm install @supabase/ssr (única dependencia nueva, aprobada).
- lib/auth.ts (nuevo):
  - createAuthClient(): createServerClient<Database> de @supabase/ssr con
    await cookies() de next/headers; getAll/setAll (setAll con try/catch:
    read-only en Server Components).
  - getUser() = cache(async () → auth.getUser() → user | null).
  - requireUser(options?: { next?: string; message?: string }): user o
    redirect a /login[?next&msg].
  - Schemas Zod: registroSchema (email válido + password mín 8),
    loginSchema (email + password no vacíos).
  - Servicios inyectables: registrarUsuario(client, email, password) →
    signUp + detección de duplicado (identities.length === 0) + insert
    public.usuario { id, rol: 'user' } · iniciarSesion(client, email,
    password) → signInWithPassword, error mapeado "Email o contraseña
    incorrectos" · cerrarSesion(client) · getPerfilData(client, userId) →
    { email, created_at, rol } con self-healing de la fila.
- lib/valoraciones.ts (nuevo): listMisValoraciones(userId) con
  supabaseServer (anon): valoracion .eq('user_id') + embed serie(titulo,
  slug), orden created_at desc → { serie: { titulo, slug }, nota,
  created_at }[].
- tests/db/auth.test.ts (nuevo, autocontenido: emails
  auth-test-<runId>@iswdb.local, cleanup en afterAll vía deleteTestUser que
  casca en cascada):
  - Registro crea auth.users + public.usuario con rol 'user'.
  - Registro duplicado → error "ya existe", sin sesión.
  - Login correcto → sesión; login con password incorrecta → error mapeado.
  - getPerfilData con fila; self-healing sin fila (borrar fila →
    getPerfilData la recrea).
  - Logout → getUser null.
- tests/lib/valoraciones.test.ts (nuevo, seed propio estilo ql-*: 2 auth
  users + categoría + series + valoraciones): filtro por user, join con
  serie, orden created_at desc, vacío para user sin valoraciones.
- Verificación: npm test -- --run verde (BD local arriba).

### T2 — Server Actions + /login + /registro
- lib/auth-actions.ts (nuevo, "use server"): accionRegistro(prevState,
  formData) · accionLogin(prevState, formData) · accionLogout(). Usan los
  servicios de lib/auth + redirects (registro → /perfil?bienvenida=1 ·
  login → next válido o /perfil · logout → signOut + redirect('/')). En
  fallo devuelven { error } sin redirigir (AUTH-02).
- components/ui/input.tsx + label.tsx (npx shadcn add, D14).
- components/registro-form.tsx + login-form.tsx ("use client",
  useActionState + useFormStatus; error del estado visible; email
  preservado en fallo; hint de mín 8 caracteres en registro).
- app/registro/page.tsx + app/login/page.tsx (RSC, metadata en español):
  - AUTH-05: getUser() con sesión → redirect('/perfil').
  - /login: banner si searchParams.msg presente (AUTH-06); next se pasa al
    form (input hidden) y se valida en la action.
  - Enlaces cruzados login ↔ registro.
- Verificación: lint + typecheck + build verdes; smoke manual con npm run
  dev (registro → perfil; login mal → error sin salir de /login).

### T3 — /perfil + header con sesión
- app/perfil/page.tsx (nuevo, RSC, force-dynamic): requireUser({ next:
  '/perfil' }) → getPerfilData + listMisValoraciones → email, fecha de
  registro (formato es-ES), badge de rol, sección "Tus valoraciones" (enlace
  a /series/<slug> + nota + fecha) o EmptyState; banner de bienvenida si
  searchParams.bienvenida (AUTH-01). Metadata "Mi perfil".
- components/header.tsx (nuevo, async server): getUser() → con sesión:
  avatar con inicial + email (link /perfil) + botón "Salir" (form con
  accionLogout); sin sesión: enlaces "Iniciar sesión" y "Registro".
- app/layout.tsx: sustituir header inline por <Header /> (sin más cambios).
- Verificación: lint + typecheck + build; smoke manual: header en ambos
  estados, logout → /.

### T4 — E2E Playwright
- e2e/global-setup.ts: exportar createAuthUser/deleteAuthUser (sin cambios
  de fixture).
- e2e/auth.spec.ts (nuevo; usuarios e2e-auth-<runId>@iswdb.local; afterAll
  los borra vía admin API):
  1. Flujo completo en un test (cookies compartidas): / con header anónimo
     ("Iniciar sesión"/"Registro" visibles) → /registro → submit válido →
     /perfil: confirmación + email + rol user + empty state de valoraciones
     → "Salir" → / con header anónimo → /login con las mismas credenciales
     → /perfil con email → header muestra el email.
  2. Login incorrecto → error visible, permanece en /login.
  3. /perfil sin sesión → redirect a /login.
  4. AUTH-05: /login y /registro con sesión → /perfil.
  5. AUTH-06: /login?msg=Debes iniciar sesión para valorar&next=/series →
     banner visible → login (usuario creado por admin API en beforeAll) →
     /series.
- Verificación: npm run test:e2e verde; catalogo/ficha/canal sin regresiones
  = evidencia AUTH-08 (el catálogo público sigue siendo anónimo: esos specs
  corren sin sesión).

### T5 — validate.sh + cierre
- ./validate.sh completo (salida pegada).
- ROADMAP.md: 008 ✅ + título "Autenticación (email + password)".
- docs/memory/session-log.md: sesión F008.
- Tag F8 + commit atómico `F8: …`.

## Archivos
**Crear**
- spec/features/008-login-registro/{spec.md,plan.md,tasks.md}
- lib/auth.ts · lib/auth-actions.ts · lib/valoraciones.ts
- app/login/page.tsx · app/registro/page.tsx · app/perfil/page.tsx
- components/header.tsx · components/login-form.tsx · components/registro-form.tsx
- components/ui/input.tsx · components/ui/label.tsx (shadcn)
- tests/db/auth.test.ts · tests/lib/valoraciones.test.ts · e2e/auth.spec.ts

**Modificar**
- package.json (+ @supabase/ssr)
- app/layout.tsx (componente Header)
- e2e/global-setup.ts (exports de helpers)
- Al cierre: ROADMAP.md · docs/memory/session-log.md

## Riesgos técnicos
- **Cookies en E2E**: la sesión solo vive dentro de un test() → el flujo
  completo va en un único test; workers=1 ya serializa.
- **GoTrue en frío**: el primer signup/login tras un reset puede fallar
  (504/554); global-setup ya templa la API de admin y los helpers de
  servidor tienen retry; si el flujo de navegador fallara, se añade warmup
  en beforeAll.
- **RLS con auth.uid()**: el insert de la fila usuario requiere sesión
  activa; @supabase/ssr fija la cookie en el signUp (confirmaciones off) y
  el self-healing de getPerfilData cubre el resto.
- **Refresh de tokens sin cliente browser**: el refresh solo ocurre en
  acciones servidoras con cookies escribibles; sesiones >1h inactivas
  (jwt_expiry=3600) pueden requerir re-login. Aceptable en este alcance.
- **Open redirect**: next validado con /^\/(?!\/)/ en la action y en /login.
- **getUser() en layout**: +1 llamada a GoTrue por request, deduplicada con
  cache() de React; las páginas ya son force-dynamic; el build no toca el
  stack.
- **shadcn add**: si input/label arrastraran dependencias nuevas, paro y
  pregunto (CONSTRAINTS).
- **Anti-enumeración de GoTrue**: el signup duplicado no devuelve error →
  detección por identities vacías (cubierta por test en T1).

## Qué NO haré (fuera de alcance)
- OAuth · recuperación de password · verificación de email · 2FA.
- Gestión de roles (F010) · edición de perfil (F010).
- Guards reales de escritura (F009 consumirá requireUser; F008 solo
  implementa el mecanismo).
- Migraciones (el esquema de F002 basta) · cambios en types/database.ts ·
  tocar lib/supabase.ts.
- middleware/proxy.ts · cliente Supabase de navegador · modificar los
  usuarios seed.
