# Tasks — Feature 026: Notificaciones de comentarios en reseñas

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Migración M20 (comentario_id + CHECK 3 tipos) + gen:types + tests/db
**Estado**: ⏳ Pendiente
**Objetivo**: extensión de `notificacion` para tipo `nuevo_comentario`.

**Entregables**:
- `supabase/migrations/20260908120000_alter_notificacion_comentarios.sql` (nuevo, M20):
  1. `add column comentario_id uuid references public.comentario (id) on delete cascade`.
  2. Backfill: `update public.notificacion set comentario_id = null;`.
  3. `drop constraint notificacion_tipo_check` + `add constraint notificacion_tipo_check
     check (tipo in ('nuevo_episodio','nuevo_seguidor','nuevo_comentario'))`.
  4. `drop constraint notificacion_columnas_por_tipo_check` + re-add de 3 vías:
     - nuevo_episodio ⇒ serie/episodio NOT NULL, seguidor_id NULL, comentario_id NULL.
     - nuevo_seguidor ⇒ seguidor_id NOT NULL, serie/episodio NULL, comentario_id NULL.
     - nuevo_comentario ⇒ comentario_id NOT NULL, serie/episodio/seguidor NULL.
  5. Sin UNIQUE nuevo_comentario (la UNIQUE global `(usuario_id, episodio_id)` se
     mantiene; episodio_id NULL no colisiona → NOTC-04).
- `npm run gen:types` (types/database.ts: `comentario_id` nullable).
- `tests/db/notificaciones-comentarios-rls.test.ts` (nuevo, patrón
  tests/db/notificaciones-seguidores-rls.test.ts):
  - insert `nuevo_comentario` con `comentario_id` válido y serie/episodio/seguidor NULL → OK.
  - insert `tipo` inválido → CHECK falla (23514).
  - insert `nuevo_comentario` sin `comentario_id` → CHECK de consistencia falla.
  - cascade: borrar el comentario → notificación borrada.
  - sin UNIQUE: 2 comentarios de B sobre la reseña de A → 2 notificaciones.
  - RLS: insert authenticated directo denegado (solo service_role).
  - regresión F019: `nuevo_episodio` (serie/episodio NOT NULL, comentario NULL) y
    F023: `nuevo_seguidor` (seguidor NOT NULL) siguen pasando el CHECK nuevo.

**Validación**: `npm test -- --run tests/db/notificaciones-comentarios-rls.test.ts
tests/db/notificaciones-seguidores-rls.test.ts` verde (BD local arriba) y `npm run typecheck`.

---

## T2: lib/notificaciones.ts (extensión + tests de servidor)
**Estado**: ⏳ Pendiente
**Objetivo**: tercer variant del union y generación de `nuevo_comentario`.

**Entregables**:
- `lib/notificaciones.ts` (modificar):
  - `Notificacion` → `NotificacionEpisodio | NotificacionSeguidor | NotificacionComentario`.
  - `NotificacionComentario` (`tipo:'nuevo_comentario'`): `{ id; leida; created_at;
    comentario: { id }; reseña: { id }; serie: { titulo, slug }; comentarista: { username } }`
    (reseña.id es necesario para el link NOTC-02; enriquecido en lectura).
  - `notificarNuevoComentario(serviceRoleClient, autorResenaId, comentarioId)` — insert
    `{ usuario_id, comentario_id, tipo:'nuevo_comentario', serie_id:null, episodio_id:null,
    seguidor_id:null }`. Sin UNIQUE.
  - `listMisNotificaciones`: incluye `comentario_id` en el select; para
    `nuevo_comentario` enriquece con lookups service-role (comentario → reseña →
    serie; comentarista username). Filas incompletas se descartan.
  - `marcarLeida`/`marcarTodasLeidas`/`contarNoLeidas` intactos.
- `tests/lib/notificaciones.test.ts` (extender): generación nuevo_comentario ·
  listado con los 3 tipos (username del comentarista, serie titulo/slug, reseña
  id) · marcar leída en los 3 · contarNoLeidas · regresión F019/F023.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/notificaciones.test.ts tests/db/notificaciones.test.ts` verde.

---

## T3: Integración en crearComentario (lib/comentarios.ts + action + tests)
**Estado**: ⏳ Pendiente
**Objetivo**: generar notificación tras comentar reseña ajena (log-and-continue).

**Entregables**:
- `lib/comentarios.ts`: `crearComentario(client, serviceRoleClient, reseñaId, userId,
  contenido)`. `reseñaPublicaExiste` → `reseñaPublicaConAutor` (devuelve
  `{ id, user_id }`). Tras insert exitoso: si `reseña.user_id !== userId` →
  `notificarNuevoComentario(serviceRoleClient, reseña.user_id, data.id)`; si falla,
  `console.error` y continúa (D25). `editarComentario`/`borrarComentario` sin cambios.
- `lib/comentarios-actions.ts`: `accionCrearComentario` crea `createServiceRoleClient()`
  y lo pasa.
- `tests/lib/comentarios.test.ts` (modificar): ajustar call-sites al nuevo
  parámetro (`dbAdmin`) y añadir: comentar reseña ajena genera notificación al
  autor · comentar la propia NO genera · editar/borrar NO generan ni borran ·
  fallo de notificación (stub que falla en insert de notificacion) NO rompe el
  comentario.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/comentarios.test.ts` verde.

---

## T4: UI + E2E Playwright
**Estado**: ⏳ Pendiente
**Objetivo**: anchor en el comentario, tercer render en notificaciones y E2E.

**Entregables**:
- `components/comentario-item.tsx`: `id={`comentario-${comentario.id}`}` en el `<li>`
  no-editor (anchor NOTC-02).
- `app/perfil/notificaciones/page.tsx`: tercer render con icono `MessageSquareText`
  (tres iconos distintos): "<username> comentó tu reseña en <serie>" + link
  `/resenas/<reseña.id>#comentario-<comentario.id>`.
- `e2e/notificaciones-comentarios.spec.ts` (nuevo):
  - A crea reseña pública en e2e-01 (service-role) · B comenta → A ve
    "<usernameB> comentó tu reseña en Serie e2e 1" con link → click navega a
    `/resenas/<id>#comentario-<id>` con el comentario visible (anchor).
  - B comenta de nuevo → A ve 2 notificaciones (NOTC-04).
  - A comenta su propia reseña → sin notificación nueva (NOTC-03).
  - Marcar leída → badge del header desaparece.
- `e2e/global-setup.ts`: `wipe()` borra también `notificacion` con
  `comentario_id is not null` (residuos) antes del borrado de comentario.

**Validación**: `npm run lint && npm run typecheck && npm run build`; `npm run
test:e2e e2e/notificaciones-comentarios.spec.ts` verde; sin regresiones en
`e2e/notificaciones.spec.ts` / `e2e/notificaciones-seguidores.spec.ts` /
`e2e/comentarios.spec.ts`.

---

## T5: validate.sh + cierre
**Estado**: ⏳ Pendiente
**Objetivo**: puerta única y docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 026 ✅.
- `DECISIONS.md`: D32 "Notificaciones de comentarios en reseñas (F026): M20
  añade comentario_id (FK comentario cascade) y extiende el CHECK tipo a
  nuevo_comentario con CHECK de consistencia 3 vías; sin UNIQUE (cada comentario
  notifica, NOTC-04); generación en crearComentario con service_role y
  log-and-continue (D25); enriquecimiento en lectura (patrón F023); anchor
  #comentario-<id> en comentario-item".
- `docs/memory/session-log.md`: sesión F026.

**Validación**: `./validate.sh` en verde; DoD completa. (Commit/tag F26 solo con
orden explícita.)

---

## Resumen de archivos

### Nuevos (3)
1. `supabase/migrations/20260908120000_alter_notificacion_comentarios.sql`
2. `tests/db/notificaciones-comentarios-rls.test.ts`
3. `e2e/notificaciones-comentarios.spec.ts`

### Modificados (≈10)
1. `lib/notificaciones.ts`
2. `lib/comentarios.ts`
3. `lib/comentarios-actions.ts`
4. `components/comentario-item.tsx`
5. `app/perfil/notificaciones/page.tsx`
6. `types/database.ts` (gen:types)
7. `tests/lib/notificaciones.test.ts`
8. `tests/lib/comentarios.test.ts`
9. `e2e/global-setup.ts`
10. `ROADMAP.md` · `DECISIONS.md` · `docs/memory/session-log.md`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Extender CHECK sin romper filas existentes | drop+re-add de ambos constraints con backfill previo; regresiones F019/F023 |
| Firma de generación vs datos de display no persistibles | Firma mínima (autorResenaId, comentarioId); enriquecimiento on read |
| Link NOTC-02 sin reseña_id en el modelo | `reseña: { id }` en `NotificacionComentario` |
| Enriquecimiento tercer tipo con service-role | Lookup comentario → reseña → serie + usuario; filas incompletas descartadas; FK cascade |
| Anchor de scroll en RSC | `id` en `<li>` server-rendered → hash nativo |
| Fallo de notificación rompe el comentario | log-and-continue (D25) + test con stub que falla |
| Auto-notificación | `reseña.user_id !== userId` + test |
| Residuos E2E | `wipe()` ampliado con `comentario_id is not null` |
| Call-sites existentes de `crearComentario` | Actualizar tests antiguos al nuevo parámetro |

---

## Fuera de alcance (NO se hace)
- Notificaciones de respuestas a comentarios ni de likes
- Agrupación · preferencias de desactivación
- Notificaciones al editar/borrar (ni borrado en cascade de ellas)
- UNIQUE por comentario (cada comentario notifica)
- Denormalizar serie/username en notificacion
- Cambiar RLS de insert autenticado en notificacion
- Serie de-aprobada en el enriquecimiento (link 404 edge case)
- Migraciones fuera de M20
- Commits/tag sin orden explícita