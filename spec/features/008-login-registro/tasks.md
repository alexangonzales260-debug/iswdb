# 008 — Login/Registro · Tareas

- [ ] T1 — lib/auth.ts + lib/valoraciones.ts + tests de servidor
  npm install @supabase/ssr (única dependencia nueva, aprobada).
  lib/auth.ts (nuevo): createAuthClient() con createServerClient de
  @supabase/ssr + await cookies() (getAll/setAll; setAll con try/catch por
  read-only en Server Components) · getUser() envuelto en cache() de React ·
  requireUser({ next, message }) con redirect a /login[?next&msg] · schemas
  Zod (registro: email válido + password mín 8; login: no vacíos) ·
  servicios inyectables: registrarUsuario (signUp + detección de duplicado
  por identities.length === 0 + insert public.usuario rol 'user'),
  iniciarSesion (error mapeado "Email o contraseña incorrectos"),
  cerrarSesion, getPerfilData (self-healing de la fila usuario).
  lib/valoraciones.ts (nuevo): listMisValoraciones(userId) con el cliente
  anon (SELECT de valoracion público, D11) + embed serie(titulo, slug),
  orden created_at desc.
  tests/db/auth.test.ts (nuevo, autocontenido, cleanup cascada vía
  deleteTestUser): creación de usuario (auth.users + usuario rol 'user') ·
  registro duplicado → error, sin sesión · login correcto/incorrecto ·
  getPerfilData con fila y self-healing sin fila · logout → getUser null.
  tests/lib/valoraciones.test.ts (nuevo, seed propio): filtro por user,
  join serie, orden, vacío sin valoraciones.
  Criterio: npm test -- --run verde (BD local arriba).

- [ ] T2 — Server Actions + /login + /registro
  lib/auth-actions.ts (nuevo, "use server"): accionRegistro, accionLogin
  (en fallo devuelven { error } sin redirigir, AUTH-02; éxito → next válido
  o /perfil; registro → /perfil?bienvenida=1), accionLogout (signOut +
  redirect '/').
  components/ui/{input,label}.tsx (npx shadcn add, D14; si arrastrara
  dependencias nuevas, parar y preguntar).
  components/{registro,login}-form.tsx ("use client", useActionState +
  useFormStatus; error visible; email preservado en fallo).
  app/login/page.tsx + app/registro/page.tsx (RSC, metadata es): guard
  AUTH-05 (sesión → redirect /perfil) · banner msg en /login (AUTH-06) ·
  next como input hidden validado en la action (/^\/(?!\/)/) · enlaces
  cruzados.
  Criterio: lint + typecheck + build verdes; smoke manual (registro →
  perfil; login mal → error sin salir de /login).

- [ ] T3 — /perfil + header con sesión
  app/perfil/page.tsx (nuevo, RSC, force-dynamic): requireUser({ next:
  '/perfil' }) → email, fecha de registro (es-ES), badge de rol, "Tus
  valoraciones" (enlace /series/<slug> + nota + fecha) o EmptyState ·
  banner bienvenida si searchParams.bienvenida (AUTH-01) · metadata
  "Mi perfil".
  components/header.tsx (nuevo, async server): con sesión → avatar con
  inicial + email (link /perfil) + form "Salir" (accionLogout); sin sesión
  → enlaces "Iniciar sesión"/"Registro".
  app/layout.tsx: header inline → <Header />.
  Criterio: lint + typecheck + build verdes; smoke manual: header en ambos
  estados, logout → /.

- [ ] T4 — E2E Playwright
  e2e/global-setup.ts: exportar createAuthUser/deleteAuthUser (sin cambios
  de fixture).
  e2e/auth.spec.ts (nuevo; usuarios e2e-auth-<runId>@iswdb.local; afterAll
  los borra): (1) flujo completo en un test: header anónimo → registro →
  /perfil con confirmación + email + rol + empty state → logout → header
  anónimo → login → /perfil → header con email · (2) login incorrecto →
  error visible, permanece en /login · (3) /perfil sin sesión → redirect a
  /login · (4) AUTH-05: /login y /registro con sesión → /perfil · (5)
  AUTH-06: /login?msg=…&next=/series → banner → login → /series.
  Criterio: npm run test:e2e verde; catalogo/ficha/canal sin regresiones =
  evidencia AUTH-08 (catálogo anónimo).

- [ ] T5 — validate.sh + cierre
  ./validate.sh completo (salida pegada) · ROADMAP.md (008 ✅ + título
  "Autenticación (email + password)") · docs/memory/session-log.md (sesión
  F008) · tag F8 + commit atómico `F8: …`.
  Criterio: Definition of Done completa.
