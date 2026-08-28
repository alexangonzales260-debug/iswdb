# 012 — Reseñas · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Longitud/formato: texto libre 50-2000 caracteres, sin estructura forzada.
2. Requiere valoración previa para reseñar (RES-02, rechazo server-side).
3. Moderación: publicación directa (sin aprobación), sin moderation_status en
   reseñas; mod/admin puede eliminar cualquier reseña.
4. UI: sección "Reseñas" en la ficha + formulario (con login) + orden
   cronológico desc (más recientes primero). Sin paginación por ahora.
5. Sin votos útiles por ahora.
6. Migración M5 aprobada explícitamente: tabla reseña + políticas RLS
   (select_public, insert_own, update_own, delete_own_or_mod).
7. Rechazo server-side de creación si la serie no está aprobada (coherente con
   VAL-07), incluso si existe valoración previa (caso: serie aprobada →
   valorada → re-rechazada por mod).
8. Si el usuario borra su valoración después de reseñar: la reseña se
   conserva; editarReseña no re-exige valoración; eliminarValoracion no se toca.
9. Botón "Eliminar" visible para el dueño de la reseña Y mod/admin (RES-04 +
   RES-09 + criterio "user normal no lo ve en reseñas de otros").
10. Tabla "reseña" (con ñ); identificadores SQL entre comillas dobles.
11. Email del autor en public.usuario (decisión A, aprobada en Build): la
    columna no existía (el email vive en auth.users, esquema no expuesto por
    PostgREST), así que se desnormaliza en usuario vía migración M6 +
    backfill. El embed usuario(id, email) del plan original no era ejecutable
    sin esta columna.

## Decisiones técnicas (justificadas)
1. **Migración M5 única** (tabla + trigger + índice + grants + RLS en un
   archivo, patrón M2+M3 juntos; aprobada explícitamente):
   - Tabla: id uuid PK gen_random_uuid(); user_id → usuario(id) on delete
     cascade; serie_id → serie(id) on delete cascade; contenido text not null
     CHECK (char_length(contenido) between 50 and 2000); created_at/updated_at
     timestamptz not null default now(); unique(user_id, serie_id) (RES-07).
   - Trigger "reseña_set_updated_at" → public.set_updated_at() (existe en M1).
   - Índice "reseña_serie_created_idx" (serie_id, created_at desc): lista de
     la ficha (RES-08); el unique ya cubre búsquedas por user+serie.
   - Grants patrón M2: select a anon/authenticated/service_role;
     insert/update/delete a authenticated/service_role.
   - RLS: enable + reseña_select_public (using true, anon+authenticated),
     reseña_insert_own (with check user_id = auth.uid()), reseña_update_own
     (using + with check user_id = auth.uid()), reseña_delete_own_or_mod
     (using user_id = auth.uid() or public.is_admin_or_mod(); D10).
   - Todos los identificadores con ñ entre comillas dobles en SQL.
   - Tras aplicar: supabase db reset + npm run gen:types.
2. **Email del autor (RES-08) vs RLS de usuario**: el email vive en
   auth.users (esquema no expuesto por PostgREST: config.toml solo expone
   public/graphql_public) y public.usuario no tenía columna email → el embed
   del plan original no era ejecutable. Decisión A (aprobada): migración M6
   añade public.usuario.email (nullable) + backfill desde auth.users;
   registrarUsuario y getPerfilData lo rellenan para usuarios nuevos; seed.sql
   incluye el email de los usuarios sintéticos. listReseñasSerie usa un
   cliente service-role nuevo: createServiceRoleClient() perezoso en
   lib/supabase.ts (env SUPABASE_SERVICE_ROLE_KEY, server-only, jamás
   NEXT_PUBLIC; se añade a .env.example y .env.local la clave demo estándar
   local, que ya es pública en tests/db/env.ts). El RLS de usuario no se toca
   (sigue ocultando la tabla al anon; el email completo solo lo lee el
   servidor vía service-role).
3. **RES-02 y estado de la serie server-side**: RLS no puede expresar "tiene
   valoración" ni "serie aprobada"; crearReseña() comprueba app-side con el
   cliente de sesión: serie por slug (inexistente → error;
   moderation_status !== 'aprobada' → error, decisión 7) → valoración del
   usuario para esa serie (ausente → 'Debes valorar la serie antes de
   reseñarla'). Carrera inofensiva aceptada: borrar la valoración entre el
   check y el insert (decisión 8).
4. **Servicios inyectables** (patrón F008/F009): crearReseña/editarReseña/
   eliminarReseña reciben AuthClient (sesión); los tests pasan clientes de
   signInTestUser (persistSession: false) → RLS con auth.uid() real sin
   request context de Next. Las lecturas (getReseñaUsuario, listReseñasSerie)
   usan clientes a nivel de módulo como getDistribucionNotas.
5. **Duplicado (RES-07)**: unique(user_id, serie_id); el servicio mapea el
   23505 a 'Ya tienes una reseña para esta serie' (la UI lo evita con el modo
   edición, pero existen carreras/llamadas directas).
6. **Server Actions**: accionCrearReseña/accionEditarReseña con firma
   useActionState (serieSlug[, reseñaId], prev, formData) mediante .bind en el
   componente; accionEliminarReseña(reseñaId, serieSlug) de llamada directa
   (useTransition, patrón rating-selector). Todas: requireUser({ next,
   message }) (AUTH-06) → createAuthClient() → servicio →
   revalidatePath(`/series/<slug>`) → { error? } en fallo.
7. **Revalidación acotada**: las reseñas solo afectan a la ficha →
   revalidatePath('/series/<slug>'), no todo el layout como F009 (las
   valoraciones tocan rankings/home). useActionState refresca el payload RSC
   al terminar la action con revalidatePath; el botón de eliminar añade
   router.refresh() explícito.
8. **Zod**: contenido → z.string().trim() con min(50)/max(2000) y mensajes de
   ERRORES_RESEÑA; se almacena el contenido ya trimeado (el CHECK de la BD
   aplica al valor guardado).
9. **truncarEmail** en lib/format.ts (función pura, test unitario): inicial
   del local part + '***' + '@' + dominio (p.ej. "s***@iswdb.local"); sin
   local part o sin '@' → '***'.
10. **Rol para el botón Eliminar**: se reutiliza getRolUsuario de lib/admin.ts
    (cliente autenticado). La sección es RSC; el botón necesita un hijo
    cliente → components/reseña-delete-button.tsx (pequeño, useTransition +
    router.refresh()).
11. **Estados del formulario (RES-05/RES-06)**: sin sesión → link
    /login?next=/series/<slug>&msg=… (AUTH-06); sesión sin valoración →
    mensaje + ancla #valoraciones-heading (id ya existente en la sección
    Valoraciones); con valoración y sin reseña → creación; con reseña propia →
    edición inline (textarea prefilled).
12. **E2E**: e2e/resenas.spec.ts (nombre ASCII). Por orden alfabético corre
    después de ficha.spec.ts y antes de valoraciones.spec.ts: el flujo valora
    e2e-01 (muta su agregado temporalmente); el cleanup (deleteAuthUser →
    cascade usuario→valoracion/reseña) debe restaurarlo antes del spec de
    valoraciones. El wipe de global-setup añade reseña. Flujo mod vía botón
    "Salir" del header; createModUser ya existe en global-setup.
13. **ADR**: al cierre se añade D18 a DECISIONS.md (publicación directa sin
    moderación previa; borrado own_or_mod; lectura service-role para el embed
    del email del autor).

## Contexto del repo (hallazgos de planificación)
- M1 define public.set_updated_at() (reutilizable); M2 crea valoracion con el
  patrón exacto a imitar (FKs cascade, unique(user_id, serie_id), trigger
  updated_at, grants); M3 define is_admin_or_mod() y la sintaxis de políticas.
- serie_select_public y valoracion_select_public usan using(true) → los
  rechazos app-side no pueden depender de RLS (igual que VAL-07 en F009).
- vitest fileParallelism=false; cada archivo de tests de BD hace cleanup+seed
  propio con runId y warmup de GoTrue en beforeAll (patrón valoraciones/rls).
- Playwright workers=1, orden alfabético; las cookies de sesión solo viven
  dentro de cada test(); global-setup ya exporta createAuthUserWithUsuario,
  createModUser, deleteAuthUser y FIXTURE (e2e-01 sin valoraciones).
- El header tiene botón "Salir" (logout para el flujo E2E de mod).
- .env.local no tiene SUPABASE_SERVICE_ROLE_KEY: se añade la clave demo
  estándar local (pública, idéntica a la de tests/db/env.ts).

## Orden de tareas (una sesión de Build por tarea)

### T1 — Migración M5 + tipos + tests DB/RLS
- supabase/migrations/<ts>_create_resena_table.sql: tabla "reseña", trigger,
  índice, grants y políticas RLS (decisión 1).
- supabase db reset + npm run gen:types; verificar que types/database.ts
  incluye la tabla y que .from('reseña') funciona en supabase-js (la ñ).
- tests/db/reseñas.test.ts (invariantes): límites 50/2000 ok; 49/2001 →
  violación de check; duplicado → 23505; trigger updated_at.
- tests/db/reseñas.test.ts (RLS en crudo): anon lee ok / escribe denegado;
  insert con user_id ajeno denegado; update/delete de no dueño no mod → 0
  filas (fila intacta); mod/admin borran cualquier reseña; mod no edita la
  de otro.
- Verificación: npm test -- --run tests/db/reseñas.test.ts verde.

### T2 — Servicios en lib/reseñas.ts + tests
- Migración M6 (decisión 11): public.usuario.email nullable + backfill desde
  auth.users; seed.sql añade el email de los usuarios sintéticos;
  registrarUsuario y getPerfilData (lib/auth.ts) rellenan la columna.
- lib/reseñas.ts (nuevo): ERRORES_RESEÑA, schema Zod, crearReseña/
  editarReseña/eliminarReseña (cliente de sesión), getReseñaUsuario/
  listReseñasSerie (service-role).
- lib/supabase.ts: createServiceRoleClient() perezoso. .env.example y
  .env.local: SUPABASE_SERVICE_ROLE_KEY.
- tests/db/reseñas.test.ts (extender): crear con valoración previa ok; sin
  valoración → RES-02; serie no aprobada → rechazo; longitudes inválidas;
  duplicado → error amigable; sin sesión; editar actualiza contenido y
  updated_at; editar ajena → rechazado; eliminar por dueño (valoración
  intacta, aserción explícita RES-04); no dueño no mod → rechazado; mod/admin
  ok; getReseñaUsuario; listReseñasSerie orden desc + embed email.
- tests/lib/format.test.ts (nuevo): truncarEmail.
- Verificación: npm test -- --run verde.

### T3 — Server Actions + componentes + integración en ficha
- lib/reseñas-actions.ts (nuevo, "use server"): accionCrearReseña/
  accionEditarReseña (useActionState) + accionEliminarReseña (llamada
  directa), con requireUser (AUTH-06) y revalidatePath('/series/<slug>').
- components/reseña-form.tsx (nuevo, "use client"): 4 estados (RES-05/RES-06/
  creación/edición inline), contador de caracteres, useActionState.
- components/reseñas-section.tsx (nuevo, RSC): lista cronológica desc con
  autor truncado, fecha y contenido; botón Eliminar (dueño o mod/admin).
- components/reseña-delete-button.tsx (nuevo, "use client").
- lib/format.ts: truncarEmail. app/series/[slug]/page.tsx: <ReseñasSection>
  tras Valoraciones.
- Verificación: lint + typecheck + build verdes; smoke manual en dev.

### T4 — E2E Playwright
- e2e/global-setup.ts: añadir reseña al wipe().
- e2e/resenas.spec.ts (nuevo): flujo login → RES-06 → valorar → reseñar sin
  recarga → editar → eliminar (valoración intacta); anónimo → RES-05; mod
  borra reseña de otro; user normal no ve Eliminar en reseña ajena.
- Verificación: npm run test:e2e verde; sin regresiones.

### T5 — validate.sh + cierre
- ./validate.sh completo (salida real pegada).
- ROADMAP.md: 012 ✅. DECISIONS.md: D18. docs/memory/session-log.md: sesión
  F012.
- Commit atómico `F12: …` tras revisión del diff (DoD #4).

## Archivos
**Crear**
- spec/features/012-resenas/{spec.md,plan.md,tasks.md}
- supabase/migrations/<ts>_create_resena_table.sql (M5)
- supabase/migrations/<ts>_add_usuario_email.sql (M6)
- lib/reseñas.ts · lib/reseñas-actions.ts
- components/reseñas-section.tsx · components/reseña-form.tsx ·
  components/reseña-delete-button.tsx
- tests/db/reseñas.test.ts · tests/lib/format.test.ts · e2e/resenas.spec.ts

**Modificar**
- lib/supabase.ts (cliente service-role) · lib/format.ts (truncarEmail)
- lib/auth.ts (registrarUsuario/getPerfilData con email, M6)
- supabase/seed.sql (email en filas de usuario)
- app/series/[slug]/page.tsx (sección Reseñas)
- e2e/global-setup.ts (wipe de reseña; helpers con email en T4)
- .env.example (+ .env.local): SUPABASE_SERVICE_ROLE_KEY
- types/database.ts (regenerado con gen:types)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md

## Riesgos técnicos
- **RLS de borrado con rol**: reseña_delete_own_or_mod depende de
  is_admin_or_mod() (SECURITY DEFINER + STABLE, D10); usuario sin fila en
  public.usuario → false. Cubierto por los tests RLS de T1.
- **RES-02 app-side**: RLS no expresa "tiene valoración"; carrera inofensiva
  (borrar valoración entre check e insert) aceptada por la decisión 8.
- **Clave service-role**: nueva env var; getter perezoso que lanza con mensaje
  claro si falta; jamás NEXT_PUBLIC ni accesible desde el cliente.
- **ñ en identificadores**: SQL entrecomillado; T1 verifica gen:types y
  .from('reseña') (los tests la ejercitan con clientes anon, de sesión y
  service-role).
- **Revalidación**: revalidatePath solo de la ficha; useActionState refresca
  automáticamente tras la action; botón de eliminar con router.refresh()
  explícito (patrón rating-selector).
- **Orden E2E**: resenas.spec.ts corre antes de valoraciones.spec.ts y muta
  temporalmente el agregado de e2e-01; el cleanup por cascada debe restaurarlo.
- **23505 duplicado**: mapeado a error amigable; la UI evita el caso normal
  con el modo edición, pero la carrera existe.

## Qué NO haré (fuera de alcance)
- Moderación previa (cola de aprobación) · votos útiles · orden por
  relevancia/rating · paginación · rich snippets/SEO de reseñas ·
  markdown/imágenes en reseñas (spec).
- Panel de reseñas en /admin · "mis reseñas" en /perfil · cambios en /login,
  header ni /perfil.
- Dependencias nuevas; tocar migraciones ya aplicadas.
