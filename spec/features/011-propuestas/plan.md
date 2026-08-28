# 011 — Propuestas de series · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. /proponer-serie público sin login. Campos: título, descripción, categoría,
   canal(es) por handle (sin @), enlace playlist/trailer. Email opcional.
2. Envío válido → redirect /propuesta-enviada (página estática) + serie
   pendiente en /admin.
3. Sin notificaciones al proponente (follow-up).
4. Migración M8 aprobada: proponente_email TEXT NULL + user_id nullable +
   RLS de insert (pendiente forzado) y de lectura (anon solo aprobada).
5. Canal inexistente → error amigable (no se crean canales nuevos).
6. moderation_status SIEMPRE 'pendiente', ignorando el input (código + RLS).

## Decisiones técnicas (justificadas)
1. **serie NO tiene user_id hoy** (visto en M1 y types/database.ts): el punto
   "(b) cambiar user_id de NOT NULL a NULL" partía de una premisa errónea;
   solo valoracion y reseña tienen user_id. La vía elegida es AÑADIR la
   columna `user_id uuid NULL references public.usuario (id) on delete set
   null`. No hay NOT NULL que quitar ni FK que recrear → el riesgo de esa
   alternativa desaparece.
2. **Descartado el "usuario sistema"** (anon-proposer@iswdb.local): contamina
   public.usuario (visible vía usuario_select_authenticated, aparece en
   conteos/joins de valoraciones/reseñas), obliga a seed y a fijar un id
   mágico en RLS (frágil). La nullable FK es el modelado canónico: propuesta
   anónima = NULL; el contacto se guarda en proponente_email. Deja la puerta
   abierta a "historial de propuestas" (follow-up: user_id = auth.uid()).
3. **RLS de lectura: solo anon se restringe a 'aprobada'** (desviación menor
   del enunciado "solo mod/admin lee pendientes", justificada). serie_select
   _public pasa a `for select to anon using (moderation_status='aprobada')` y
   se crea serie_select_authenticated `to authenticated using (true)`. MOTIVO:
   VAL-07 (lib/valoraciones.ts:112) y RES-01 (lib/reseñas.ts:37) leen
   pendientes con el cliente autenticado para dar mensajes amigables
   (serieNoAprobada) y tests/db/valoraciones.test.ts:208 y reseñas.test.ts:442
   lo verifican; restringir authenticated rompería ambos tests. PRO-06 exige
   solo anónimo. F010 sigue igual: listSeriesPendientes lee con mod
   (authenticated using(true)) y el panel se protege con requireMod en la UI
   (decisión 1 de F010). No ocultar pendientes a usuarios logueados queda
   registrado como follow-up.
4. **Escritura de propuestas: función SECURITY DEFINER `crear_propuesta()`**
   (enmienda al plan RLS, 28-ago-2026). Hallazgo de PostgreSQL verificado
   empíricamente en el stack local: con RLS activo, una fila nueva añadida por
   INSERT debe ser TAMBIÉN legible por las policies SELECT del rol (el check
   de INSERT incorpora la visibilidad). Como anon no puede leer pendientes
   (decisión 3), un policy `serie_insert_propuesta` (pendiente + user_id null)
   rechazaría su propio insert → INVIABLE. La alternativa estándar de
   Supabase: función `public.crear_propuesta()` SECURITY DEFINER + search_path
   fijo que inserta serie + participa en UNA transacción, con
   moderation_status='pendiente' y user_id=NULL forzados en SQL (sin parámetro
   para el status: PRO-04). Anon y authenticated solo reciben EXECUTE; NO hay
   grants de insert para anon en serie/participa (M1 da solo SELECT) →
   defensa extra contra inserts directos por API (aut oficio "no llege a RLS").
5. ~~participa_insert_propuesta~~ (eliminada: la cubre la transacción de
   crear_propuesta y la FK). El requisito "canales solo existen" se cumple doble:
   el servicio lib resuelve handle→id con mensaje amigable (PRO-03) y la FK
   canal_id rechaza ids inexistentes como backstop.
6. **GRANTS**: sin cambios sobre M1. No se da INSERT a anon en serie/participa;
   sí `grant execute on public.crear_propuesta(...) to anon, authenticated` y
   `revoke execute ... from public` (por defecto EXECUTE es público).
7. **Slug**: `slugify(titulo) || 'serie'` + `-prop-` + Date.now() + sufijo
   aleatorio `crypto.randomUUID().slice(0,6)` → imposible colisionar aunque el
   mismo título se envíe dos veces en el mismo ms (riesgo señalado). Namespace
   distinto de las series reales; el unique de serie.slug queda de backstop.
   Se genera en lib y se pasa a la función (que lo inserta tal cual).
8. **crearPropuesta (lib) en 1 llamada** (mejor que el plan de 2 pasos): Zod →
   categoria slug→id → resolver canales por handle (mensaje amigable) →
   slug -prop- → `client.rpc('crear_propuesta', {...})`. La transacción de la
   función ELIMINA el riesgo de pendiente huérfana del plan original.
9. **accionProponerSerie SIN requireUser** (pública). createAuthClient() →
   crearPropuesta → revalidatePath('/admin') (inofensivo; /admin es
   force-dynamic) → redirect('/propuesta-enviada') FUERA del try/catch
   (patrón admin-actions). En fallo → { error } para useActionState.
10. **/propuesta-enviada**: página estática sin DB ni force-dynamic.
11. **descripcion requerida 10-5000** (según plan aprobado); ajustable a
    opcional si se prefiere (riesgo 6).

## Contexto del repo (hallazgos de planificación)
- serie (M1): SIN user_id. moderation_status check con default 'aprobada'
  (se mantiene; 'pendiente' lo fuerza código + RLS).
- M3 serie_select_public `using(true)`: se divide en anon/aprobada +
  authenticated/true. tests/db/rls.test.ts:150-169 (anon insert denegado con
  default 'aprobada') seguirá verde con la nueva policy.
- VAL-07/RES-01 y sus tests bloquean restringir authenticated (decisión 3).
- getCategorias() existe (lib/categorias.ts). createModUser YA existe en
  e2e/global-setup.ts (reutilizable; no se toca). slugify en lib/admin.ts.
- supabase/seed.sql NO se toca (vía nullable: no hay usuario sistema).

## Orden de tareas (una sesión de Build por tarea)

### T1 — Migración M8 + tipos + tests RLS
- supabase/migrations/20260828120000_add_proponente_columns.sql:
  a) serie + proponente_email text · + user_id uuid null refs usuario on delete
     set null.
  b) drop serie_select_public → serie_select_public (anon: aprobada) +
     serie_select_authenticated (authenticated: true).
  c) función crear_propuesta(...) SECURITY DEFINER (pendiente + user_id null
     forzados en SQL, insert serie + participa en transacción) + revoke
     execute from public + grant execute to anon, authenticated. SIN grants de
     insert a anon (enmienda 28-ago-2026: policies RLS de insert inviables por
     la visibilidad SELECT exigida por PG).
- supabase db reset + npm run gen:types (types/database.ts).
- tests/db/propuestas-rls.test.ts (fixture propio prop-rls-*): anon RPC → serie
  pendiente + participa creados · anon INSERT directo serie/participa →
  permission denied · anon SELECT pendiente → 0 filas · anon SELECT aprobada →
  ok · anon RPC con canal inexistente → error FK · user autenticado RPC → ok ·
  user directo pendiente → RLS denegado · user SELECT pendiente → ok
  (VAL-07/RES-01) · mod SELECT pendiente → ok.
- Verificación: npm test -- --run (sin regresión en admin/rls/valoraciones).

### T2 — lib/propuestas.ts + tests
- schemaPropuesta (Zod v4): titulo trim 3-200 · descripcion 10-5000 ·
  categoria (slug) requerido · proponente_email email opcional · playlist_url
  url opcional · canales ≥1 [{ handle (sin @), rol enum }].
- crearPropuesta(client, datos): Zod (moderation_status NO está en el schema →
  se ignora siempre) → categoria slug→id → resolver canales por handle
  (normaliza @, minúsculas; si falta: "El canal <handle> no existe en el
  catálogo") → slug -prop-<ts>-<rand> → rpc('crear_propuesta', {…}) con
  canal_ids + roles (transacción única; no hay inserts cliente intermedios).
- tests/lib/propuestas.test.ts (vi.hoisted env + requireLocalDb + fixture
  prop-*): happy path (pendiente + email + participa + slug prop-) ·
  input moderation_status='aprobada' → se ignora (queda pendiente) · canal
  inexistente → mensaje amigable · titulo vacío/corto → Zod · email inválido →
  Zod · categoria inexistente → error.
- Verificación: npm test -- --run.

### T3 — lib/propuestas-actions.ts ("use server")
- accionProponerSerie(prevState, formData): SIN requireUser. Parseo de campos
  + canales como JSON oculto (patrón serie-form/admin-actions). try crear
  Propuesta → catch { error }. Fuera del try: revalidatePath('/admin') +
  redirect('/propuesta-enviada').
- Verificación: lint + typecheck.

### T4 — UI
- app/proponer-serie/page.tsx (RSC, force-dynamic): metadata "Proponer serie ·
  ISWDB" · getCategorias → EmptyState si vacío → PropuestaForm.
- components/propuesta-form.tsx ("use client", justificado: filas dinámicas +
  useActionState): titulo input · descripcion textarea · categoria select ·
  canales filas dinámicas (input handle sin @ + select rol) con añadir/
  eliminar y mínimo 1 · enlace input url · email opcional. Validación cliente:
  titulo required + ≥1 canal. error → p role=alert.
- app/propuesta-enviada/page.tsx (estático): metadata "Propuesta enviada ·
  ISWDB" · "Gracias. Tu propuesta será revisada por el equipo. No recibirás
  notificación de la decisión por ahora." · links a / y /proponer-serie.
- Verificación: lint + typecheck + build + smoke en dev.

### T5 — E2E
- e2e/propuestas.spec.ts: beforeAll createModUser(EMAIL_MOD).
  1. Anónimo → /proponer-serie → formulario visible (PRO-01).
  2. Rellenar (titulo, descripcion, categoria, handle 'canal-uno' + rol) →
     submit → /propuesta-enviada con "Gracias…" (PRO-01).
  3. Login mod → /admin → propuesta en cola (PRO-07).
  4. Mod aprueba → visible en /series con los datos del proponente (PRO-08).
  afterAll: deleteSeriesBySlugLike('-prop-%') (cascade participa) +
  deleteAuthUser(mod).
- Verificación: npm run test:e2e sin regresiones.

### T6 — validate.sh + cierre
- ./validate.sh (salida real pegada) · ROADMAP.md 011 ✅ · DECISIONS.md:
  aclarar D9 (F011 con user_id nullable en serie) · session-log.md ·
  commit `F11: …` tras revisión del diff (DoD #4).

## Archivos
**Crear**
- spec/features/011-propuestas/{spec,plan,tasks}.md
- supabase/migrations/20260828120000_add_proponente_columns.sql
- lib/propuestas.ts · lib/propuestas-actions.ts
- app/proponer-serie/page.tsx · app/propuesta-enviada/page.tsx
- components/propuesta-form.tsx
- tests/lib/propuestas.test.ts · tests/db/propuestas-rls.test.ts
- e2e/propuestas.spec.ts

**Modificar**
- types/database.ts (npm run gen:types)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md
- e2e/global-setup.ts: NO (createModUser ya existe) · supabase/seed.sql: NO

## Riesgos técnicos
1. ~~Pendiente huérfana~~ ELIMINADO: la función transaccional cubre serie +
   participa en un solo paso (enmienda 28-ago-2026).
2. **Colisión de slug**: el sufijo <ts>-<rand> la elimina; unique de backstop.
3. **Spam de propuestas**: sin rate limiting (follow-up). Solo se puede entrar
   por la función (no hay INSERT directo), y RLS fuerza leyenda pendiente.
4. **Lectura de pendientes por usuarios logueados** (solo anon restringido,
   por VAL-07/RES-01). Cierre total = follow-up con service-role en esos
   servicios.
5. **participa/episodio de pendientes siguen legibles por anon** (solo ids, sin
   título/descripción). Hardening opcional: restringir select de anon con
   subconsulta. Fuera del core.
6. **descripcion requerida (mín 10)**: ajustable a opcional si se prefiere.
7. **RPC pública**: cualquier persona con la URL de la función puede llamarla
   (pendiente + user_id null forzados). Spam mitigado por la cola de
   moderación + rate limiting follow-up.

## Qué NO haré (fuera de alcance)
- Edición/eliminación de propuestas por el proponente
- Notificaciones al proponente (email al aprobar/rechazar)
- Rate limiting / anti-spam
- Creación de canales nuevos en propuestas
- Historial de propuestas del proponente
- Campo motivo del rechazo
- Tocar /admin salvo el revalidatePath · e2e/global-setup.ts · seed.sql ·
  header (enlace a /proponer-serie sería follow-up opcional)
- Dependencias nuevas