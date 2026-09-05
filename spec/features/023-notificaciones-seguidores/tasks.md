# Tasks — Feature 023: Notificaciones de nuevos seguidores

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Migración M16 (serie_id/episodio_id nullable, seguidor_id, tipo) + gen:types + tests/db
**Estado**: Pendiente
**Objetivo**: extensión de `notificacion` para tipo `nuevo_seguidor`.

**Entregables**:
- `supabase/migrations/<ts>_alter_notificacion_tipos.sql` (nuevo, M16):
  1. `episodio_id drop not null` y `serie_id drop not null`.
  2. `add column seguidor_id uuid references public.usuario(id) on delete cascade`.
  3. `add column tipo text not null default 'nuevo_episodio'`.
  4. `add constraint notificacion_tipo_check check (tipo in
     ('nuevo_episodio','nuevo_seguidor'))`.
  5. `add constraint notificacion_columnas_por_tipo_check` (consistencia por
     tipo: nuevo_episodio requiere serie/episodio y prohíbe seguidor;
     nuevo_seguidor al revés). Se MANTIENE la UNIQUE global original
     `(usuario_id, episodio_id)` — los NULL no colisionan (NOT-11, cada follow
     notifica) y el episodio no-nulo da idempotencia (NOT-07); un índice
     parcial rompería el `onConflict` del upsert de F019.
  6. Backfill: `set tipo='nuevo_episodio', seguidor_id=null`.
  7. Índice `(usuario_id, tipo)`.
- `npm run gen:types` (types/database.ts: `tipo`, `seguidor_id` nullable, serie/
  episodio nullable).
- `tests/db/notificaciones-seguidores-rls.test.ts` (nuevo, patrón
  tests/db/notificaciones.test.ts):
  - insert `nuevo_seguidor` con `seguidor_id` válido y serie/episodio NULL → OK.
  - insert con `episodio_id` NULL y `tipo='nuevo_episodio'` → CHECK falla (23514).
  - insert `tipo` inválido → CHECK falla.
  - 2 filas `nuevo_seguidor` mismo par (seguidor→seguido) → ambas persist (NOT-11).
  - 2 filas `nuevo_episodio` mismo (usuario, episodio) → UNIQUE global rechaza (NOT-07).
  - cascade: borrar seguidor → sus notificaciones de seguidor se borran.
  - backfill: filas pre-existentes quedan con `tipo='nuevo_episodio'`,
    `seguidor_id=NULL`.
  - RLS: authenticated insert directo denegado (solo service_role).

**Validación**: `npm test -- --run tests/db/notificaciones-seguidores-rls.test.ts`
verde (BD local arriba) y `npm run typecheck`.

---

## T2: lib/notificaciones.ts (extensión + tests de servidor)
**Estado**: Pendiente
**Objetivo**: modelo unión por tipo y generación de `nuevo_seguidor`.

**Entregables**:
- `lib/notificaciones.ts` (modificar):
  - `Notificacion` → `NotificacionEpisodio | NotificacionSeguidor`
    (discriminated union por `tipo`).
  - `listMisNotificaciones`: discrimina por `tipo`; resuelve username del
    seguidor por `seguidor_id`; sin `conRelaciones` global.
  - `notificarNuevoSeguidor(serviceRoleClient, seguidoId, seguidorId)` — insert
    `nuevo_seguidor` sin UNIQUE.
  - `marcarLeida`/`marcarTodasLeidas`/`contarNoLeidas` intactos.
- `tests/lib/notificaciones.test.ts` (nuevo): generación de seguidor · listado
  con ambos tipos · marcar leída funciona en ambos · contarNoLeidas ·
  `nuevo_episodio` intacto.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/notificaciones.test.ts tests/db/notificaciones.test.ts` verde.

---

## T3: Integración en seguirUsuario (lib/sigue-usuarios.ts + action + tests)
**Estado**: Pendiente
**Objetivo**: generar notificación tras follow exitoso (log-and-continue).

**Entregables**:
- `lib/sigue-usuarios.ts`: `seguirUsuario(client, serviceRoleClient, seguidorId,
  seguidoId)` — tras insert exitoso (no 23505/23514/23503) llama
  `notificarNuevoSeguidor`; si falla, `console.error` y continúa (D25).
- `lib/sigue-usuarios-actions.ts`: `accionSeguirUsuario` crea
  `createServiceRoleClient()` y lo pasa.
- `tests/lib/sigue-usuarios.test.ts` (modificar): seguir genera notificación ·
  dejar de seguir NO genera · seguir de nuevo genera OTRA (no idempotente,
  NOT-11) · autofollow/23503 no generan · fallo de notificación no rompe follow.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/sigue-usuarios.test.ts` verde.

---

## T4: app/perfil/notificaciones/page.tsx (render por tipo)
**Estado**: Pendiente
**Objetivo**: UI muestra ambos tipos con iconos distintos y link al seguidor.

**Entregables**:
- `app/perfil/notificaciones/page.tsx`: switch por `tipo`.
  - `nuevo_episodio` → "Nuevo episodio en <serie>" + detalle (Bell) (existente).
  - `nuevo_seguidor` → "<username> empezó a seguirte" + `<Link
    href="/usuarios/<username>">` (UserPlus).
  - Timestamp es-ES `Intl.DateTimeFormat` compartido.

**Validación**: `npm run lint && npm run typecheck && npm run build`; revisión
visual con ambos tipos de notificación.

---

## T5: E2E Playwright
**Estado**: Pendiente
**Objetivo**: flujo real seguir → notificación → click → perfil del seguidor.

**Entregables**:
- `e2e/notificaciones-seguidores.spec.ts` (nuevo):
  - A sigue a B → B ve "A empezó a seguirte" en `/perfil/notificaciones` con
    link al perfil de A → click → navega a `/usuarios/<A>`.
  - A deja de seguir y sigue de nuevo → B ve 2 notificaciones (no se sobrescribe).
  - A/auto: B no recibe notificación de B mismo (CHECK M15).
- `e2e/global-setup.ts`: `wipe()` borra también `notificacion` de tipo seguidor
  (residuos de corridas muertas).

**Validación**: `npm run test:e2e e2e/notificaciones-seguidores.spec.ts` verde;
sin regresiones en `e2e/notificaciones.spec.ts` / `e2e/sigue-usuarios.spec.ts`.

---

## T6: validate.sh + cierre
**Estado**: Pendiente
**Objetivo**: puerta única y docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 023 ✅.
- `DECISIONS.md`: D29 "Notificaciones de nuevos seguidores (F023): M16 hace
  serie_id/episodio_id nullable, añade seguidor_id y tipo (CHECK
  nuevo_episodio/nuevo_seguidor); índice parcial para idempotencia de
  nuevo_episodio y sin UNIQUE para nuevo_seguidor (cada follow notifica);
  generación en seguirUsuario con service_role y log-and-continue (D25);
  /perfil/notificaciones con unión por tipo y link al seguidor".
- `docs/memory/session-log.md`: sesión F023.

**Validación**: `./validate.sh` en verde; DoD completa. (Commit/tag F23 solo con
orden explícita.)

---

## Resumen de archivos

### Nuevos (3)
1. `supabase/migrations/<ts>_alter_notificacion_tipos.sql`
2. `tests/db/notificaciones-seguidores-rls.test.ts`
3. `e2e/notificaciones-seguidores.spec.ts`

### Modificados (≈10)
1. `lib/notificaciones.ts`
2. `lib/sigue-usuarios.ts`
3. `lib/sigue-usuarios-actions.ts`
4. `app/perfil/notificaciones/page.tsx`
5. `types/database.ts` (gen:types)
6. `tests/lib/notificaciones.test.ts` (nuevo)
7. `tests/lib/sigue-usuarios.test.ts`
8. `tests/db/notificaciones.test.ts`
9. `e2e/global-setup.ts`
10. `ROADMAP.md` · `DECISIONS.md` · `docs/memory/session-log.md`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `serie_id` NOT NULL rompe insert de seguidor | M16 lo hace nullable (hallazgo) |
| UNIQUE global v/s por tipo | UNIQUE global (usuario_id, episodio_id) mantenida; NULLs no colisionan (NOT-11), episodio no-nulo da idempotencia (NOT-07); sin índice parcial para no romper upsert de F019 |
| Backfill de filas existentes | `set tipo='nuevo_episodio', seguidor_id=null` antes de nuevas columnas |
| Join heterogéneo en listado | Discriminated union + lookup de username por seguidor_id |
| Fallo de notificación no rompe follow | log-and-continue (D25) + test |
| Auto-follow / residuos E2E | CHECK M15 + wipe() ampliado |

---

## Fuera de alcance (NO se hace)
- Notificaciones de "dejó de seguirte"
- Notificaciones por comentarios (F025) / listas (F024)
- Agrupación ("3 personas empezaron a seguirte")
- Preferencias (desactivar notificaciones de seguidores)
- Modificar RLS de insert autenticado
- Migraciones fuera de M16
- Commits/tag sin orden explícita
