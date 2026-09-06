# 025 — Comentarios en reseñas · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Migración M19 con tabla comentario: id uuid PK, reseña_id FK reseña
   cascade, user_id FK usuario cascade, contenido text NOT NULL (límite 1000
   chars), created_at timestamptz. RLS: select público (cualquiera lee),
   insert/update/delete own (user_id = auth.uid()). Sin updated_at.
2. UI: sección "Comentarios" en ficha de reseña. Lista con username + fecha +
   contenido. Form para añadir (solo con sesión). Editar/borrar en propios.
3. Ruta: /reseñas/<id> como página de reseña individual. Link desde ficha de
   serie y desde perfil público. Sin sesión: leer; con sesión: comentar.
4. Alcance: CRUD simple. Sin respuestas anidadas, sin likes/upvotes, sin
   moderación, sin notificaciones de nuevos comentarios.
5. MIGRACIÓN M19 APROBADA EXPLÍCITAMENTE (CONSTRAINTS). Permisos: cualquiera
   lee, dueño gestiona. Sin permisos especiales para autor de reseña.

## Verificación previa del esquema (hallazgos)
- Contador de migraciones: M17 create_lista_colaborador (F024) · M18 fix anon
  select de lista_colaborador. Etiqueta libre: **M19**. El timestamp debe ser
  posterior a 20260905160000 (M18) → `20260905170000_create_comentario.sql`.
- DECISIONS.md termina en D30 → F025 cierra con **D31**. ROADMAP: 024 último →
  025 ✅.
- Las reseñas ya se renderizan en dos sitios: (1) la ficha a través de
  components/reseñas-section.tsx (RES-08) → el link COM-07 se añade ahí
  (app/series/[slug]/page.tsx ya renderiza <ReseñasSection>); (2) el perfil
  público app/usuarios/[username]/page.tsx (SeccionReseñas, USR-05) → el link
  COM-08 se añade ahí. app/perfil/page.tsx (privado) NO lista reseñas (solo
  "Tus valoraciones"): queda sin link; añadir una sección "mis reseñas" a
  /perfil está fuera de alcance.
- lib/reseñas.ts no tiene getReseña por id (solo getReseñaUsuario /
  listReseñasSerie): se añade en T3 para la página /reseñas/<id>.
- usuario_select_own (M7) oculta la tabla usuario a terceros (anon sin grant)
  → el embed usuario(username) de los comentarios solo es legible con un
  cliente service-role server-side: exactamente el patrón listReseñasSerie con
  createServiceRoleClient (D25).
- getPerfilPublico (F021) ya define "reseña pública" = serie aprobada
  (serie!inner + moderation_status = 'aprobada'): getReseña y crearComentario
  reutilizan ese criterio.
- e2e/global-setup.ts wipe(): borra reseña antes que serie; comentario (FK →
  reseña on delete cascade) debe borrarse ANTES de reseña.
- Patrones a imitar: F012 (servicios inyectables + Server Actions + sección en
  ficha), F024 (plan con verificación previa; tests divididos tests/db/*-rls +
  tests/lib/*; cierre con tag solo bajo orden explícita).

## Decisiones técnicas (justificadas)

### 1. Migración M19 (`20260905170000_create_comentario.sql`)
```sql
-- M19: tabla comentario (F025) + RLS
-- Comentarios de usuarios sobre reseñas (COM-01..06). FK cascade en ambas
-- direcciones (borrar la reseña o el usuario borra sus comentarios). Sin
-- updated_at: editar solo cambia contenido (COM-02). RLS: select público
-- (cualquiera lee, COM-04) y write own (COM-01/02/03/05); sin permisos
-- especiales para el autor de la reseña. Identificadores con ñ entre
-- comillas dobles (decisión 10 de F012).

create table public.comentario (
  id uuid primary key default gen_random_uuid(),
  "reseña_id" uuid not null references public."reseña" (id) on delete cascade,
  user_id uuid not null references public.usuario (id) on delete cascade,
  contenido text not null check (char_length(contenido) between 1 and 1000),
  created_at timestamptz not null default now()   -- patrón reseña (M5)
);

-- Lista de la página de reseña (COM-04): orden cronológico descendente.
create index comentario_resena_ix on public.comentario ("reseña_id", created_at desc);

alter table public.comentario enable row level security;

create policy comentario_select_public on public.comentario
  for select to anon, authenticated using (true);
create policy comentario_insert_own on public.comentario
  for insert to authenticated with check (user_id = auth.uid());
create policy comentario_update_own on public.comentario
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comentario_delete_own on public.comentario
  for delete to authenticated using (user_id = auth.uid());

-- Grants patrón M2: select público; write solo authenticated + service_role.
grant select on table public.comentario to anon, authenticated, service_role;
grant insert, update, delete on table public.comentario to authenticated, service_role;
```
Notas:
- Sin trigger (no hay updated_at que refrescar, COM-02).
- Sin UNIQUE: un usuario puede comentar una reseña varias veces.
- Tras aplicar: `supabase db reset` + `npm run gen:types`.

### 2. Lectura de username con service-role
El RLS público de comentario deja leer filas a cualquiera (COM-04), pero el
embed `usuario ( username )` choca con usuario_select_own (M7): anon no ve la
tabla usuario y un authenticated solo ve su fila. Por eso:
- `listComentariosPorReseña(client, reseñaId, limit)` y `getReseña(client, id)`
  reciben el cliente por parámetro y en la app se llaman con
  `createServiceRoleClient()` (exactamente el patrón listReseñasSerie). En los
  tests, `dbAdmin` de tests/db/env.ts.
- El username es público por diseño (D27, perfil público /usuarios/<username>):
  exponerlo via service-role en una lectura server-side controlada no rompe
  ninguna política.

### 3. Servicios inyectables (lib/comentarios.ts, nuevo)
Patrón F012/F024. Reciben `AuthClient` + `userId` explícito (las Server Actions
pasan `requireUser().id`; los tests clientes con sesión de signInTestUser).
`ERRORES_COMENTARIO`: `sinSesion` (usado por requireUser de las actions),
`reseñaNoEncontrada`, `comentarioNoEncontrado`, `sinPermiso`, `contenidoVacio`,
`contenidoMuyLargo`.
- `contenidoSchema = z.string().trim().min(1, contenidoVacio).max(1000,
  contenidoMuyLargo)` (1-1000, COM-06); se almacena el contenido trimeado (el
  CHECK de la BD aplica al valor guardado, patrón F012).
- `crearComentario(client, reseñaId, userId, contenido)` — COM-01: Zod →
  verifica que la reseña existe y es pública (serie aprobada, patrón
  getPerfilPublico) con el cliente de sesión (reseña_select_public permite
  leer) → inexistente o no pública → `reseñaNoEncontrada` → insert con
  user_id = userId → retorna el comentario creado (id, contenido, created_at).
  El RLS insert_own exige user_id = auth.uid() → userId de la sesión.
- `editarComentario(client, comentarioId, userId, contenido)` — COM-02: Zod →
  update contenido por id + user_id (RLS update_own como backstop) → 0 filas:
  discriminación con un select (select_public deja ver comentarios ajenos) →
  existe → `sinPermiso`; no existe → `comentarioNoEncontrado`. Sin cambios en
  created_at (no hay updated_at).
- `borrarComentario(client, comentarioId, userId)` — COM-03: delete por id +
  user_id (RLS delete_own) → 0 filas: misma discriminación → `sinPermiso` /
  `comentarioNoEncontrado` (COM-05).
- `listComentariosPorReseña(clientServiceRole, reseñaId, limit = 50)` —
  COM-04: verifica que la reseña existe (→ reseñaNoEncontrada) → select
  `id, contenido, created_at, usuario ( id, username )` por reseña_id, order
  created_at desc, limit, filtro defensivo de usernames null (patrón conAutor
  de listReseñasSerie) → `ComentarioPublico[]`.

### 4. getReseña en lib/reseñas.ts (nueva, para la página)
`getReseña(clientServiceRole, id): Promise<ReseñaDetalle | null>` — select de
la reseña por id con `serie!inner ( id, titulo, slug )` filtrada a
`moderation_status = 'aprobada'` (reseña pública) + `usuario ( id, username )`
para el autor. null si no existe o su serie no está aprobada → el RSC hace
notFound(). Filtro defensivo de embed null (patrón conAutor).

### 5. Server Actions (lib/comentarios-actions.ts, nuevo)
Patrón reseñas-actions (requireUser → createAuthClient → servicio →
revalidatePath; fallo → `{ error }`):
- `accionCrearComentario(reseñaId, prev, formData)` — useActionState.
- `accionEditarComentario(reseñaId, comentarioId, prev, formData)` —
  useActionState con .bind en comentario-item.
- `accionBorrarComentario(reseñaId, comentarioId)` — llamada directa
  (useTransition, patrón reseña-delete-button).
- `requireUser({ next: /reseñas/<id>, message: ERRORES_COMENTARIO.sinSesion })`
  (AUTH-06) → user.id como userId.
- **Revalidación acotada**: solo `revalidatePath('/reseñas/<id>')`. Los
  comentarios no muestran contador ni fragmento en la ficha ni en el perfil:
  ninguna otra ruta cambia.

### 6. Página app/reseñas/[id]/page.tsx (RSC, force-dynamic)
- `getReseña(createServiceRoleClient(), id)` → `notFound()` (patrón F004, 404
  decida antes de emitir shell; incluir generateMetadata consistente).
- `getUser()` para saber si hay sesión.
- `listComentariosPorReseña(createServiceRoleClient(), id, 50)`.
- Render: reseña completa (autor username, fecha Intl es-ES, contenido
  pre-wrap, link a `/series/<slug>`) + sección "Comentarios": form solo si hay
  sesión (sin sesión → aviso/empty state, COM-04 lee pero no comenta) + lista.

### 7. Componentes cliente
- `components/comentario-form.tsx` — textarea (name=contenido, maxLength 1000)
  + contador n/1000 + submit, useActionState, error role=alert. Modo 'crear'
  (form de la página) o 'editar' (prefilled, dentro de comentario-item).
- `components/lista-comentarios.tsx` — props { comentarios, userId }: mapea
  comentario-item; empty state.
- `components/comentario-item.tsx` — username + fecha + contenido pre-wrap; si
  `userId === comentario.autor.id` → botones Editar/Borrar; estado local de
  edición inline (textarea + accionEditarComentario) y borrado con
  useTransition + accionBorrarComentario.

### 8. Links COM-07/COM-08
- components/reseñas-section.tsx: en cada <article> de reseña se añade un Link
  "Comentar" / "Ver reseña" → `/reseñas/${reseña.id}`. Es RSC: sin fetch extra.
- app/usuarios/[username]/page.tsx (SeccionReseñas): link por reseña →
  `/reseñas/${reseña.id}` (COM-08). /perfil (privado) sin cambio (no lista
  reseñas).

### 9. E2E (e2e/comentarios.spec.ts)
- Setup: usuario A (createAuthUserWithUsuario) + reseña pública de A en
  e2e-01 insertada por service-role (contenido ≥50 chars); se guarda el id.
  Cleanup por cascada (deleteAuthUserByEmail → comentario/reseña), idéntico a
  resenas.spec.
- Flujos: link desde /series/e2e-01 → /reseñas/<id> navega (COM-07) · anon ve
  reseña + comentarios sin form (COM-04) · B (login) añade comentario → visible
  con su username → edita inline → actualiza → borra → desaparece · C (ajeno)
  ve comentarios de B pero sin botones Editar/Borrar (COM-05). El link COM-08
  se verifica navegando desde /usuarios/<username> de B a /reseñas/<id>.

### 10. ADR de cierre
D31 en DECISIONS.md: tabla comentario (M19) con RLS select público / write own
sin updated_at; página /reseñas/<id>; lectura de username con service-role
(D25/M7); getReseña como "reseña pública" = serie aprobada; errores sinPermiso
vs comentarioNoEncontrado.

## Contexto del repo (breve)
- Patrón servicios inyectables + Server Actions + RSC como F012/F024.
- Patrón embed con service-role: listReseñasSerie (lib/reseñas.ts, D25).
- Patrón RLS select público + own write: reseña (M5), valoracion (M2).
- Tests: tests/db/*-rls.test.ts (RLS crudo) + tests/lib/*.test.ts (servicios),
  helpers de tests/db/env.ts (createTestUser, signInTestUser, dbAdmin, unwrap,
  requireLocalDb, usernameDesdeEmail) y e2e/global-setup.ts.

## Orden de tareas (una sesión de Build por tarea)
T1 Migración M19 + gen:types + tests DB/RLS.
T2 lib/comentarios.ts + getReseña en lib/reseñas.ts + tests de servicio.
T3 lib/comentarios-actions.ts + app/reseñas/[id]/page.tsx + componentes +
   links (ficha y perfil).
T4 E2E Playwright.
T5 validate.sh + cierre (ROADMAP 025 ✅, DECISIONS D31, session-log, commit
   F25; tag F25 solo con orden explícita).

## Archivos
**Crear**
- spec/features/025-comentarios-resenas/{spec.md,plan.md,tasks.md}
- supabase/migrations/20260905170000_create_comentario.sql (M19)
- lib/comentarios.ts · lib/comentarios-actions.ts
- app/reseñas/[id]/page.tsx
- components/comentario-form.tsx · components/lista-comentarios.tsx ·
  components/comentario-item.tsx
- tests/db/comentarios-rls.test.ts · tests/lib/comentarios.test.ts
- e2e/comentarios.spec.ts

**Modificar**
- components/reseñas-section.tsx (link COM-07 en cada reseña)
- app/usuarios/[username]/page.tsx (link COM-08 en SeccionReseñas)
- lib/reseñas.ts (getReseña)
- e2e/global-setup.ts (wipe de comentario antes de reseña)
- types/database.ts (gen:types)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md

## Riesgos técnicos
- **Segmento de ruta con ñ**: app/reseñas/ sería el primer segmento de ruta
  no-ASCII del repo. Next 16 soporta segmentos UTF-8 (la URL se codifica en
  percent-encoding y el router la decodifica al matchear), pero es caso nuevo:
  T3 lo verifica con build + smoke de navegación. Si fallara, el plan
  propuesto sería ruta ASCII (`/resenas/<id>`) → requiere tu OK (decisión de
  ruta ya aprobada).
- **RLS público vs own**: anon recibe grants amplios por el default ACL de
  Supabase; select_public using(true) devuelve todo y los writes anon mueren en
  RLS con "row-level security" (no "permission denied") → los asserts de tests
  anon-write aceptan /permission denied|row-level security/i (modelo M5).
- **Embed username**: usuario_select_own (M7) oculta usuario → lecturas con
  service-role (nunca anon). Riesgo de exponer username ajeno de más no aplica:
  el username es público por diseño (D27).
- **Edición sin updated_at**: sin columna ni trigger; editar cambia solo
  contenido (COM-02); los tests no deben asumir updated_at.
- **Errores editar/borrar**: 0 filas = inexistente o ajeno → select de
  discriminación (select_public deja ver ajenos) → sinPermiso vs
  comentarioNoEncontrado.
- **Validación duplicada**: Zod (trim 1-1000) + CHECK en BD (1-1000 sobre el
  valor guardado/trimeado): 0 chars tras trim → contenidoVacio; >1000 →
  contenidoMuyLargo; 23514 en BD como backstop.
- **"Reseña pública"**: definida como serie aprobada (criterio compartido con
  getPerfilPublico) en getReseña y crearComentario; una reseña de serie no
  aprobada no es listable ni comentable vía UI aunque el RLS select sea público.
- **Orden de wipe E2E**: comentario → reseña → serie (FK cascade).
- **Revalidación acotada**: solo /reseñas/<id> (los comentarios no afectan a
  otras rutas).

## Qué NO haré (fuera de alcance)
- Respuestas anidadas (hilos) · likes/upvotes · moderación de comentarios ·
  notificaciones de nuevos comentarios · historial/updated_at · permisos
  especiales para el autor de la reseña · comentarios en reseñas no públicas.
- Contador de comentarios en la ficha o perfil · sección "mis reseñas" en
  app/perfil (privado no lista reseñas hoy) · cambios en RLS/políticas de
  reseña o usuario · dependencias nuevas · editar migraciones aplicadas.
- Commits sin tu orden · tag F25 sin orden explícita (modelo F024).