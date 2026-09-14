# Plan técnico — Feature 026: Notificaciones de comentarios en reseñas

## Decisiones aprobadas (por el usuario)
1. Generación en `crearComentario` (lib/comentarios.ts) tras insert exitoso,
   solo si el autor de la reseña es distinto al comentarista.
2. Migración M20 sobre tabla notificacion (M16): `comentario_id` uuid nullable
   FK comentario cascade + CHECK tipo extendido a 'nuevo_comentario' + CHECK de
   consistencia tipo↔columnas + backfill `comentario_id = NULL`. Sin UNIQUE para
   nuevo_comentario (cada comentario notifica, NOTC-04).
3. UI en `/perfil/notificaciones`: "<username> comentó tu reseña en <serie>" +
   link a `/resenas/<id>#comentario-<id>` (anchor `id="comentario-<id>"` en
   comentario-item.tsx).
4. Solo notificaciones de comentarios en reseñas propias (ni respuestas ni
   likes).
5. NO auto-notificación (comentar la propia reseña) ni al editar/borrar; fallo
   de notificación → log-and-continue (D25).

## Verificación previa del esquema (hallazgos)
- Contador de migraciones: M19 create_comentario (F025) es la última → M20 libre.
  Timestamp posterior a 20260905170000 → `20260908120000_alter_notificacion_comentarios.sql`.
- DECISIONS termina en D31 → F026 cierra con **D32**. ROADMAP: 025 último → 026 ✅.
- UNIQUE global `(usuario_id, episodio_id)` de M12: `nuevo_comentario` lleva
  `episodio_id` siempre NULL (CHECK de consistencia) → los NULL no colisionan en
  un índice btree → cada comentario genera fila nueva (NOTC-04) sin tocar el
  upsert de F019. Idéntico a la conclusión 2 de F023.
- `notificacion` solo tiene grants `select/update` a authenticated e `insert` a
  service_role (M12): el insert de la notificación debe hacerse con
  `createServiceRoleClient()` y pasa por el patrón inyectable.
- El enriquecimiento de `nuevo_comentario` en `listMisNotificaciones` necesita
  el **id de la reseña** además de serie/comentarista: el link NOTC-02 es
  `/resenas/<reseña_id>#comentario-<comentario_id>`. El modelo union de T2 se
  extiende con `{ comentario: { id }, reseña: { id }, serie: { titulo, slug },
  comentarista: { username } }`.
- `reseñaPublicaExiste` (lib/comentarios.ts) devuelve hoy solo `boolean` y lee
  `serie!inner( moderation_status )`. Para decidir NOTC-01 hace falta el
  `user_id` de la reseña → se cambia a un fetch que devuelve `{ id, user_id }`.
  El RLS reseña_select_public (using(true)) permite leer `user_id` con el cliente
  de sesión.
- e2e/global-setup.ts `wipe()` borra `notificacion` de tipo nuevo_seguidor y
  después `comentario`/`reseña`. Hay que añadir limpieza de notificaciones con
  `comentario_id is not null` (residuos de corridas muertas) antes del borrado de
  comentario.
- El fixture E2E de series confirmado: `titulo = Serie e2e 1`, `slug = slugSerie(1)`
  (e2e/global-setup.ts:315).

## Decisiones técnicas

### 1. Migración M20 (`20260908120000_alter_notificacion_comentarios.sql`)
```sql
-- M20: F026 — notificacion soporta tipo 'nuevo_comentario'
-- comentario_id referencia el comentario que dispara la notificación
-- (FK cascade: borrar comentario/reseña/usuario borra la notificación).
-- Sin UNIQUE: cada comentario genera una notificación (NOTC-04).

alter table public.notificacion
  add column comentario_id uuid references public.comentario (id) on delete cascade;

-- Backfill: las filas existentes (nuevo_episodio / nuevo_seguidor) no
-- referencian ningún comentario.
update public.notificacion set comentario_id = null;

-- Tipo: se extiende el CHECK de M16 con el tercer valor.
alter table public.notificacion
  drop constraint notificacion_tipo_check,
  add constraint notificacion_tipo_check check (tipo in ('nuevo_episodio', 'nuevo_seguidor', 'nuevo_comentario'));

-- Consistencia por tipo (3 vías). Las filas existentes ya cumplen los
-- primeros dos ramos y el backfill deja comentario_id NULL.
alter table public.notificacion
  drop constraint notificacion_columnas_por_tipo_check,
  add constraint notificacion_columnas_por_tipo_check check (
    (tipo = 'nuevo_episodio'    and serie_id is not null and episodio_id is not null and seguidor_id is null and comentario_id is null)
    or
    (tipo = 'nuevo_seguidor'    and seguidor_id is not null and serie_id is null and episodio_id is null and comentario_id is null)
    or
    (tipo = 'nuevo_comentario'  and comentario_id is not null and serie_id is null and episodio_id is null and seguidor_id is null)
  );
```
Notas:
- Deben dropearse y recrearse los DOS constraints (tipo_check y
  columnas_por_tipo_check): el CHECK de consistencia de M16 no admite el tercer
  tipo, y sin extenderlo el insert de `nuevo_comentario` fallaría (23514).
- Sin UNIQUE nuevo_comentario: la UNIQUE global `(usuario_id, episodio_id)` se
  mantiene y no interfiere (episodio_id NULL para nuevo_comentario).
- Al terminar: `npm run gen:types`.

### 2. `lib/notificaciones.ts` (extensión)
- `Notificacion = NotificacionEpisodio | NotificacionSeguidor | NotificacionComentario`.
  - `NotificacionComentario` (`tipo:'nuevo_comentario'`): `{ id; leida;
    created_at; comentario: { id }; reseña: { id }; serie: { titulo, slug };
    comentarista: { username } }`.
- `notificarNuevoComentario(serviceRoleClient, autorResenaId, comentarioId)`:
  insert `{ usuario_id: autorResenaId, comentario_id: comentarioId,
  tipo:'nuevo_comentario', serie_id: null, episodio_id: null, seguidor_id: null }`.
  Firma mínima validada: los datos de display (serie/username) se resuelven en
  lectura (patrón F023), no se persisten en la fila.
- `listMisNotificaciones`: se añade `comentario_id` al select. Para
  `tipo === 'nuevo_comentario'` se enriquece con lookups service-role:
  1. `comentario` (id, reseña_id, user_id).in(comentario_ids).
  2. `reseña` id → serie_id .in(reseña_ids) (columna "reseña_id" con ñ).
  3. `serie` (id, titulo, slug).in(serie_ids) y `usuario` (id, username).in(comentario user_ids).
  La FK cascade garantiza consistencia: borrar comentario/reseña/usuario borra
  la notificación. Serie de-aprobada es caso administrativo raro (el link puede
  dar 404 en /resenas/<id>) → fuera de alcance, sin filtro de moderación en el
  enriquecimiento. Filas incompletas → descartadas (patrón `conRelaciones`).
- `marcarLeida`, `marcarTodasLeidas`, `contarNoLeidas`: sin cambios (operan por
  id/leida, independientes de tipo).

### 3. Integración en `lib/comentarios.ts`
- `crearComentario(client, serviceRoleClient, reseñaId, userId, contenido)`:
  cambia la firma para recibir `serviceRoleClient` (patrón seguirUsuario F023).
  `reseñaPublicaExiste` → `reseñaPublicaConAutor(client, reseñaId)` que devuelve
  `{ id, user_id } | null` (select `id, user_id, serie!inner ( moderation_status )`).
  Tras el insert exitoso: si `reseña.user_id !== userId` →
  `notificarNuevoComentario(serviceRoleClient, reseña.user_id, data.id)`; si
  lanza → `console.error` y continúa (D25, el comentario ya existe, no se
  revierte). Auto-notificación queda implícitamente bloqueada (userId === autor).
- `editarComentario` / `borrarComentario`: sin cambios (NOTC-05).

### 4. `lib/comentarios-actions.ts`
- `accionCrearComentario`: crea `createServiceRoleClient()` y lo pasa a
  `crearComentario`. `accionEditarComentario` / `accionBorrarComentario` sin
  cambios.

### 5. `components/comentario-item.tsx`
- `id={`comentario-${comentario.id}`}` en el `<li>` no-editor (anchor NOTC-02;
  el branch de edición es transitorio y no necesita anchor). Scroll a hash
  nativo del browser sobre HTML renderizado por servidor (RSC force-dynamic).

### 6. `app/perfil/notificaciones/page.tsx`
- Tercer render: icono `MessageSquareText` (tres iconos distintos) + texto
  "<username> comentó tu reseña en <serie>" con link
  `<Link href={`/resenas/${reseña.id}#comentario-${comentario.id}`}>`. Timestamp
  es-ES `Intl.DateTimeFormat` compartido (existente).

### 7. Tests de servidor
- `tests/db/notificaciones-comentarios-rls.test.ts` (nuevo): inserción
  `nuevo_comentario` con comentario_id válido → OK · tipo inválido → 23514 ·
  `nuevo_comentario` sin comentario_id → 23514 · cascade borrar comentario →
  notificación borrada · sin UNIQUE (2 comentarios → 2 notificaciones) · RLS:
  insert authenticated directo denegado (solo service_role) · regresión F019
  (nuevo_episodio con comentario_id NULL) y F023 (nuevo_seguidor intacto).
- `tests/lib/notificaciones.test.ts` (extender): generación nuevo_comentario ·
  listado con los 3 tipos (comentarista username, serie titulo/slug, reseña id) ·
  marcarLeida en los 3 · contarNoLeidas · regresión F019/F023.
- `tests/lib/comentarios.test.ts` (modificar): ajustar call-sites de
  `crearComentario` (nuevo parámetro `dbAdmin` como serviceRoleClient) · comentar
  reseña ajena genera notificación al autor · comentar la propia NO · editar/
  borrar NO generan ni borran · fallo de notificación NO rompe el comentario
  (stub de serviceRoleClient que falla en insert de notificacion).

### 8. E2E (`e2e/notificaciones-comentarios.spec.ts`, nuevo)
- Setup: A y B vía `createAuthUserWithUsuario`; reseña pública de A en e2e-01
  insertada por service-role (guarda el id). Título de serie "Serie e2e 1".
- Flujos: B comenta la reseña de A → A ve "<usernameB> comentó tu reseña en
  Serie e2e 1" con link → click navega a `/resenas/<id>#comentario-<id>` y el
  comentario con su contenido es visible (anchor) · B comenta de nuevo → A ve
  2 notificaciones · A comenta su propia reseña → sin notificación nueva
  (cuenta sigue en 2). Marcar leída → badge desaparece.
- `e2e/global-setup.ts`: `wipe()` borra también `notificacion` con
  `comentario_id is not null` antes de `comentario`.

### 9. Cierre
- ROADMAP.md: 026 ✅ · DECISIONS.md: D32 · docs/memory/session-log.md · tag F26
  (solo bajo orden explícita, precedente F023).

## Archivos a crear/modificar

### Nuevos
1. `supabase/migrations/20260908120000_alter_notificacion_comentarios.sql` (M20).
2. `tests/db/notificaciones-comentarios-rls.test.ts`.
3. `e2e/notificaciones-comentarios.spec.ts`.

### Modificar
1. `lib/notificaciones.ts` — tercer variant + `notificarNuevoComentario` +
   enriquecimiento en `listMisNotificaciones`.
2. `lib/comentarios.ts` — firma de `crearComentario` + generación log-and-continue.
3. `lib/comentarios-actions.ts` — pasa `createServiceRoleClient()`.
4. `components/comentario-item.tsx` — anchor `id="comentario-<id>"`.
5. `app/perfil/notificaciones/page.tsx` — tercer render con `MessageSquareText`.
6. `types/database.ts` — `npm run gen:types`.
7. `tests/lib/notificaciones.test.ts` — tercer tipo.
8. `tests/lib/comentarios.test.ts` — call-sites + casos nuevos.
9. `e2e/global-setup.ts` — wipe de nuevo_comentario.
10. `ROADMAP.md` · `DECISIONS.md` · `docs/memory/session-log.md` (cierre T5).

## Riesgos técnicos
| Riesgo | Mitigación |
|--------|------------|
| Extender el CHECK sin romper filas existentes | drop+re-add de `notificacion_tipo_check` y `notificacion_columnas_por_tipo_check`; backfill `comentario_id=null` antes; las filas nuevo_episodio/nuevo_seguidor cumplen los ramos nuevos. Tests de regresión F019/F023 |
| Firma `notificarNuevoComentario`: parámetros de display no persistibles | Firma mínima (autorResenaId, comentarioId); serie/username/reseña se resuelven en `listMisNotificaciones` (patrón F023) |
| Modelo union sin reseña_id → link NOTC-02 sin path | `reseña: { id }` en `NotificacionComentario` |
| Enriquecimiento tercer tipo con service-role | Lookup comentario → reseña → serie + usuario(username); FK cascade garantiza consistencia de datos; filas incompletas se descartan |
| Anchor de scroll en RSC | `id` en el `<li>` renderizado por servidor → scroll a hash nativo del browser; la página es force-dynamic |
| Fallo de notificación no rompe el comentario | try/catch + console.error (D25); test con serviceRoleClient que falla |
| Auto-notificación | Bloqueada por lógica (`reseña.user_id !== userId`); test dedicado |
| Residuos en notificacion (E2E) | `wipe()` ampliado con `comentario_id is not null` |
| Call-sites existentes de `crearComentario` | Firma extendida con serviceRoleClient; se actualizan tests antiguos |

## Qué NO harás (fuera de alcance)
- Notificaciones de respuestas a comentarios ni de likes en reseñas
- Agrupación de notificaciones · preferencias de desactivación
- Notificaciones al editar/borrar comentarios (ni borrado en cascade de ellas)
- UNIQUE por comentario (cada comentario notifica, NOTC-04)
- Denormalizar serie/username en notificacion (enriquecimiento on read)
- Cambiar el RLS de `notificacion` (insert sigue solo service_role)
- Filtrar serie aprobada en el enriquecimiento / manejar serie de-aprobada
- Migraciones fuera de M20 · cambiar `marcarLeida`/`marcarTodasLeidas`/`contarNoLeidas`
- Commits ni tag/cabeceras sin orden explícita