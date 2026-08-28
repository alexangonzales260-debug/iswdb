# 010 — Admin: moderation dashboard · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Alcance: moderación (aprobar/rechazar pendientes) + CRUD de series para
   mod/admin. Gestión de roles fuera de scope (vía SQL; trigger anti-escalada
   D10 ya protege).
2. Permisos: mod y admin con el mismo poder de moderación/CRUD en la UI.
3. RLS: políticas de escritura mod/admin con is_admin_or_mod() — aprobación
   explícita. Hallazgo: ya existen en M3 (ver Contexto); confirmado el
   27-ago-2026 NO crear migración y cubrirlo con tests.
4. UI: /admin (cola de pendientes + listado de todas + botón nueva serie),
   /admin/series/nueva, /admin/series/<slug>/editar.
5. Formulario: campos básicos (título, slug auto, descripción, categoría,
   estado, años, playlist_url, portada_url) + sub-formularios para canales
   (canal existente + rol) y episodios (temporada/número/título/video_id).
   Sin borrado físico de series (solo cambio de estado).
6. editarSerie: pasos secuenciales idempotentes (confirmado 27-ago-2026;
   PostgREST no permite update + altas/bajas en un solo request).

## Decisiones técnicas (justificadas)
1. **Sin migración nueva**: la migración M3
   (20260826162336_rls_and_triggers.sql:74-102) ya crea exactamente las
   políticas aprobadas: serie/episodio/participa/canal (y categoria)
   insert/update/delete para authenticated con is_admin_or_mod(). Recrearlas
   fallaría ("policy already exists"); duplicarlas con otros nombres sería
   redundante (políticas permissivas con OR). La cobertura nueva va en tests
   (T1): el rol mod no tenía cobertura explícita.
2. **Guard requireMod()** en lib/admin.ts: getUser() → sin sesión notFound();
   consulta usuario.rol → si no es mod/admin, notFound(). ADM-04: 404 en vez
   de redirect a /login (a diferencia de requireUser en /perfil): no revelar
   la existencia del panel. Se invoca en app/admin/layout.tsx (cubre todas
   las subrutas) y en cada Server Action (defensa en profundidad).
3. **crearSerie atómica sin RPC**: un único request PostgREST con inserts
   anidados — `from('serie').insert({ ...campos, participa: [{ canal_id,
   rol }], episodio: [{ temporada, numero, titulo, video_id }] })` —
   PostgREST envuelve todas las mutaciones de un request en una sola
   transacción (ADM-05).
4. **editarSerie secuencial e idempotente**: update serie → upsert participa
   (onConflict 'serie_id,canal_id') + delete de canales ausentes → upsert
   episodio (onConflict 'id'; filas nuevas sin id se insertan) + delete de
   episodios ausentes por id. Cada paso es idempotente; un fallo parcial deja
   estado consistente y reintentable (riesgo 1).
5. **Slug autogenerado**: slugify(titulo) sin acentos; en creación, si está
   ocupado → sufijo -2, -3…; el constraint unique queda de backstop (23505 →
   error amigable). Inmutable en edición (no romper URLs públicas).
6. **Sub-formularios dinámicos**: componente cliente con estado de filas
   (añadir/eliminar); las filas se serializan como JSON en un input oculto y
   la action las parsea con Zod (validación server-side, ADM-08). Canal =
   select de canal existente (listCanales) + rol (principal/colaborador/
   invitado); episodio = temporada/número/título/video_id.
7. **Server Actions**: accionAprobarSerie/accionRechazarSerie devuelven
   `{ error? }` + revalidatePath('/', 'layout'); accionCrearSerie/
   accionEditarSerie con useActionState: `{ error }` en fallo,
   redirect('/admin') en éxito. No-mod en action → notFound() (riesgo 4).
8. **Tests de páginas/guard por E2E**: el repo no tiene infra de tests de
   componentes RSC (tests/ cubre lib/ y BD); el 404 de user/anon en /admin se
   verifica en e2e/admin.spec.ts (patrón F008/F009).
9. **Revalidación**: revalidatePath('/', 'layout') tras cada mutación de
   moderación/CRUD (afecta a catálogo, home, fichas y /admin); consistente
   con la decisión 9 de F009 (asumible a escala de catálogo).

## Contexto del repo (hallazgos de planificación)
- **RLS de escritura ya existe** (M3): serie/episodio/participa/canal/
  categoria insert/update/delete con is_admin_or_mod() (SECURITY DEFINER +
  STABLE, D10). tests/db/rls.test.ts cubre escritura de admin y denegación a
  anon y authenticated sin fila; el rol mod NO tenía cobertura → T1.
- **serie** (M1): titulo not null, slug unique, descripcion, portada_url,
  categoria_id FK NOT NULL, playlist_url, estado check activa/finalizada
  (default activa), anio_inicio/anio_fin smallint + check fin>=inicio,
  moderation_status check borrador/pendiente/aprobada/rechazada (default
  aprobada), trigger updated_at.
- **episodio**: unique(serie_id,temporada,numero) y unique(serie_id,video_id).
  **participa**: PK(serie_id,canal_id), rol check principal/colaborador/
  invitado (default colaborador).
- **Servicios inyectables** (patrón F008/F009): reciben AuthClient por
  parámetro; los tests usan signInTestUser (persistSession:false) → RLS con
  auth.uid() real sin request context de Next.
- **Fixture E2E**: e2e-16 es pendiente (Canal Tres, con valoración alta a
  propósito) → flujo de aprobar sin inventar datos. OJO: e2e/admin.spec.ts
  corre PRIMERO alfabéticamente (workers=1); si aprueba e2e-16 cambia el
  catálogo (16 aprobadas → paginación) y rompe catalogo/ficha/valoraciones.
  El test restaura e2e-16 a pendiente y el afterAll borra lo creado.
- **getCategorias()** existe (lib/categorias.ts); **listCanales()** no existe
  → se añade en lib/canales.ts (id/nombre/handle, lectura pública).
- **ROADMAP**: la fila 010 dice "Mis series" (L1) → se actualiza al cierre.
  D9 decía que la cola de moderación se materializa en F011 → aclarar en
  DECISIONS que la moderación llega en 010 (F011 queda para aportes).
- **GoTrue local**: usuarios de test vía createTestUser/signInTestUser
  (tests/db/env.ts) y createAuthUser (e2e/global-setup.ts), con retry en frío.

## Orden de tareas (una sesión de Build por tarea)

### T1 — Tests RLS rol mod (sin migración)
- tests/db/rls.test.ts: usuario mod nuevo (createTestUser + fila usuario con
  rol 'mod' + signInTestUser).
  - mod: insert/update serie ok · insert episodio ok · insert canal ok ·
    update canal ok · insert participa ok · update participa ok · delete
    participa ok.
  - user normal: insert serie/episodio/participa denegados; update serie y
    update/delete participa → 0 filas (RLS USING); la fila participa queda
    intacta.
  - anon: insert serie/episodio/participa denegados (completa la cobertura
    existente de canal/valoracion).
- Verificación: `npm test -- --run` verde (BD local arriba).

### T2 — lib/admin.ts: lecturas + moderación + tests
- getRolUsuario(client, userId) → 'user' | 'mod' | 'admin' | null.
- requireMod(): getUser() → !user → notFound(); rol ∉ {mod,admin} → notFound().
- listSeriesPendientes(client): moderation_status='pendiente', created_at asc.
- listTodasSeries(client): todas con moderation_status, created_at desc.
- getSerieParaEditar(client, slug): campos + participa(canal) + episodios;
  null si no existe.
- aprobarSerie(client, serieId) / rechazarSerie(client, serieId).
- lib/canales.ts: listCanales() (id, nombre, handle).
- tests/lib/admin.test.ts (fixture adm-* propio, usuarios mod/user):
  pendientes solo pendientes · todas incluye todos los estados ·
  getSerieParaEditar con canales y episodios / slug inexistente → null ·
  aprobar/rechazar con mod ok (cambia moderation_status) · con user → error
  RLS · anon → error RLS.
- Verificación: `npm test -- --run` verde.

### T3 — lib/admin.ts: crearSerie/editarSerie + Zod + tests
- serieAdminSchema (Zod): titulo mín 1 · descripcion opcional · categoria
  (slug existente) · estado enum · anio_inicio/anio_fin int opcionales
  (fin>=inicio) · playlist_url/portada_url url opcionales · canales[]
  (canal_id existente + rol enum) · episodios[] (temporada/numero int ≥1,
  titulo mín 1, video_id mín 1; sin duplicados temporada/numero ni video_id).
- slugify() + generarSlugUnico(client, titulo): sufijos -2, -3… si ocupa.
- crearSerie(client, input): categoria slug→id; insert anidado
  (participa + episodio) en un solo request (transacción, ADM-05); 23505 →
  error amigable.
- editarSerie(client, slug, input): update campos (slug inmutable) → upsert
  participa onConflict 'serie_id,canal_id' + delete ausentes → upsert episodio
  onConflict 'id' + delete ausentes por id.
- tests/lib/admin.test.ts (extender): crear serie completa en un request
  (serie + 2 canales + 2 episodios → filas correctas) · titulo duplicado →
  slug con sufijo · validaciones (titulo vacío, anio_fin<anio_inicio,
  categoria inexistente) · editar: cambio de campos, añadir/quitar canal (y
  cambio de rol), añadir/quitar episodio · user → denegado por RLS.
- Verificación: `npm test -- --run` verde.

### T4 — lib/admin-actions.ts ("use server")
- Guard requireMod al inicio de cada action (ADM-04).
- accionAprobarSerie(serieId) / accionRechazarSerie(serieId) → { error? } +
  revalidatePath('/', 'layout').
- accionCrearSerie(prevState, formData) / accionEditarSerie(slug, prevState,
  formData): parseo de campos básicos + JSON de canales/episodios → servicio
  (Zod) → redirect('/admin') en éxito; { error } en fallo.
- Verificación: lint + typecheck verdes; verificar notFound() dentro de
  action (riesgo 4).

### T5 — UI: layout, páginas y componentes
- app/admin/layout.tsx: requireMod() (guard único para todas las subrutas).
- app/admin/page.tsx (ADM-01): cola de pendientes con moderation-buttons,
  listado de todas con estado + link editar, botón "Nueva serie".
- app/admin/series/nueva/page.tsx: getCategorias + listCanales → SerieForm
  con accionCrearSerie.
- app/admin/series/[slug]/editar/page.tsx: getSerieParaEditar → notFound si
  null → SerieForm con datos iniciales y accionEditarSerie.
- components/admin/serie-form.tsx ("use client", justificado: filas
  dinámicas): campos básicos + sub-formularios canales/episodios (añadir/
  eliminar filas) + JSON oculto + useActionState + error visible.
- components/admin/moderation-buttons.tsx ("use client"): aprobar/rechazar
  con useTransition + estado pending.
- Verificación: lint + typecheck + build verdes; smoke manual en dev.

### T6 — E2E Playwright
- e2e/global-setup.ts: createModUser(email) = createAuthUser + fila usuario
  con rol 'mod'.
- e2e/admin.spec.ts (corre primero alfabéticamente; cleanup restaura):
  1. Anónimo → /admin → "Página no encontrada" (ADM-04).
  2. User normal → login → /admin y /admin/series/nueva → 404 (ADM-04).
  3. Mod → login → /admin → ve e2e-16 en cola (ADM-01) → aprobar (ADM-02) →
     desaparece de la cola → visible en catálogo público (/series/e2e-16) →
     restaurar a pendiente al final del test.
  4. Mod → nueva serie por UI (con canal + episodio) → visible en catálogo →
     editar (cambio de campos + episodio nuevo) → verificar (ADM-05/ADM-06).
  afterAll: e2e-16 → pendiente · borrar series creadas · borrar usuarios.
- Verificación: `npm run test:e2e` verde; sin regresiones en el resto.

### T7 — validate.sh + cierre
- ./validate.sh completo (salida real pegada).
- ROADMAP.md: 010 → "Admin: moderation dashboard" ✅.
- DECISIONS.md: aclarar D9 (la moderación se materializa en 010; F011 queda
  para aportes de usuarios).
- docs/memory/session-log.md: sesión F010.
- Commit atómico `F10: …`, tras tu revisión del diff (DoD #4).

## Archivos
**Crear**
- spec/features/010-admin/{spec.md,plan.md,tasks.md}
- lib/admin.ts · lib/admin-actions.ts
- app/admin/layout.tsx · app/admin/page.tsx
- app/admin/series/nueva/page.tsx · app/admin/series/[slug]/editar/page.tsx
- components/admin/serie-form.tsx · components/admin/moderation-buttons.tsx
- tests/lib/admin.test.ts · e2e/admin.spec.ts

**Modificar**
- lib/canales.ts (listCanales)
- tests/db/rls.test.ts (cobertura rol mod)
- e2e/global-setup.ts (createModUser)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md

## Riesgos técnicos
1. **Sync participa/episodio en edición**: upsert con onConflict correctos
   (participa 'serie_id,canal_id'; episodio 'id' para existentes, insert para
   nuevas). Si el formulario envía temporada/numero duplicados contra filas
   no enviadas → 23505 → error amigable (no falla en silencio).
2. **RLS con auth.uid() + rol**: is_admin_or_mod() es SECURITY DEFINER STABLE
   (M3, testeada). El usuario mod necesita fila en public.usuario con rol mod:
   en tests/E2E se crea explícitamente; en producción vía SQL (gestión de
   roles fuera de scope).
3. **Slug único en creación**: check previo + constraint unique de backstop
   (23505 mapeado). En edición el slug es inmutable → sin riesgo.
4. **notFound() dentro de Server Actions**: Next 16 debe propagar el 404; se
   verifica en T4/T5. Fallback si no: retorno silencioso {} (la UI ya hace el
   guard en el layout).
5. **E2E alfabético**: admin.spec.ts corre el primero y muta el fixture
   (aprobar e2e-16 → 16 aprobadas → paginación de /series). El test restaura
   e2e-16 a pendiente y borra lo creado; el afterAll es la red.
6. **Revalidación global**: revalidatePath('/', 'layout') tras cada mutación;
   asumible a escala de catálogo (misma palanca que F009).

## Qué NO haré (fuera de alcance)
- Gestión de roles (promover a mod/admin) — vía SQL.
- Moderación de reseñas (F012) · curación manual de hero (F011).
- Borrado físico de series (solo cambio de estado).
- Migraciones nuevas ni cambios en types/database.ts (esquema intacto).
- Dependencias nuevas.
- Link a /admin en el header (se entra por URL; follow-up opcional).
- Tocar páginas/actions fuera de /admin.
