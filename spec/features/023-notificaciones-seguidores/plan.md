# Plan técnico — Feature 023: Notificaciones de nuevos seguidores

## Decisiones aprobadas (por el usuario)
1. Generación en `seguirUsuario` (lib/sigue-usuarios.ts) tras insert exitoso.
2. Migración M16: `episodio_id` nullable + `serie_id` nullable + `seguidor_id`
   nullable (FK usuario cascade) + `tipo` text not null default 'nuevo_episodio'
   + CHECK `tipo IN ('nuevo_episodio','nuevo_seguidor')` + CHECK de consistencia
   por tipo + **UNIQUE global `(usuario_id, episodio_id)` mantenida de M12**:
   los NULL no colisionan (NOT-11 cada follow notifica) y el episodio no-nulo
   preserva la idempotencia (NOT-07); el upsert de F019 sigue funcionando.
3. UI en `/perfil/notificaciones` con texto "<username> empezó a seguirte" +
   link al perfil del seguidor (`/usuarios/<username>`).
4. Solo notificaciones de nuevos seguidores (no "dejó de seguirte").
5. Modificar `seguirUsuario` para generar notificación tras el insert exitoso
   (log-and-continue si falla, D25).

## Verificación previa del esquema (hallazgos)
| Item M12 | Valor actual | Acción en M16 |
|----------|--------------|---------------|
| `episodio_id` | `NOT NULL` | `drop not null` |
| `serie_id` | `NOT NULL` | `drop not null` (no estaba en el prompt; requisito real de `nuevo_seguidor`) |
| `seguidor_id` | no existe | `add nullable uuid references usuario(id) on delete cascade` |
| `tipo` | no existe | `add text not null default 'nuevo_episodio'` + CHECK |
| `unique (usuario_id, episodio_id)` | global (M12) | se **mantiene**: NULLs no colisionan (NOT-11) y episodio no-nulo da idempotencia (NOT-07); no rompe el upsert de F019 |
| Filas existentes | todas `nuevo_episodio` | backfill: `tipo='nuevo_episodio'`, `seguidor_id=NULL` |

**Conclusión 1 — `serie_id` y `episodio_id` deben ser ambos nullable.** Una
notificación `nuevo_seguidor` no referencia serie ni episodio. Sin `serie_id`
nullable el insert de seguidor falla (23502). Se extiende el alcance de M16
respecto al prompt original (ajuste necesario, se documenta y se propone).

**Conclusión 2 — UNIQUE global mantenida, sin índice parcial.** La `UNIQUE`
global `(usuario_id, episodio_id)` de M12 se mantiene: un índice parcial
rompe el `onConflict` del upsert de F019 (PostgREST no soporta predicados).
Con la UNIQUE global, `nuevo_episodio` (episodio no-nulo) sigue siendo
idempotente (NOT-07, D25) y `nuevo_seguidor` (episodio siempre NULL por el
CHECK de consistencia) nunca colisiona → cada follow genera notificación
(NOT-11, no idempotente en el tiempo).

**Conclusión 3 — `listMisNotificaciones` pasa a unión heterogénea.** El modelo
`Notificacion` actual exige `serie`+`episodio` (y el filtro `conRelaciones`
descarta filas con serie/episodio null). Debe convertirse en un discriminated
union por `tipo`: `nuevo_episodio` embebe serie+episodio; `nuevo_seguidor`
embebe `seguidor { username }`. El join de enriquecimiento no es una FK
embebible única → el username del seguidor se resuelve con un lookup adicional
por `seguidor_id` (service/own) conservando el patrón inyectable.

**Conclusión 4 — `seguirUsuario` necesita service_role para notificar.** El
insert de `notificacion` está restringido a service_role (M12). La acción actual
pasa solo el cliente de sesión. `seguirUsuario` recibe además un
`serviceRoleClient` por parámetro (patrón inyectable, D25); la acción crea
`createServiceRoleClient()`. Si la notificación falla: log + continúa (no rompe
el follow, D25).

## Decisiones técnicas

### 1. Migración M16 (`..._alter_notificacion_tipos.sql`)
```sql
-- M16: F023 — notificacion soporta tipo 'nuevo_seguidor'
-- serie_id y episodio_id dejan de ser obligatorios (nuevo_seguidor no tiene
-- serie ni episodio). Se añaden tipo (discriminador) y seguidor_id (FK).
alter table public.notificacion
  alter column episodio_id drop not null,
  alter column serie_id    drop not null,
  add column seguidor_id uuid references public.usuario(id) on delete cascade,
  add column tipo text not null default 'nuevo_episodio';

alter table public.notificacion
  add constraint notificacion_tipo_check check (tipo in ('nuevo_episodio','nuevo_seguidor'));

-- Consistencia por tipo.
alter table public.notificacion
  add constraint notificacion_columnas_por_tipo_check check (
    (tipo = 'nuevo_episodio' and serie_id is not null and episodio_id is not null and seguidor_id is null)
    or
    (tipo = 'nuevo_seguidor' and seguidor_id is not null and serie_id is null and episodio_id is null)
  );

-- Idempotencia NOT-07 vía UNIQUE global (usuario_id, episodio_id) mantenida de
-- M12: NULLs no colisionan (NOT-11). Sin índice parcial (rompe onConflict de F019).

-- Backfill: filas existentes son nuevos episodios.
update public.notificacion set tipo='nuevo_episodio', seguidor_id=null;

-- Índice para listar seguidor por notificación y filtrar por tipo.
create index notificacion_tipo_idx on public.notificacion (usuario_id, tipo);
```
Al terminar: `npm run gen:types`.

### 2. `lib/notificaciones.ts` (extensión)
- Modelo: `Notificacion = NotificacionEpisodio | NotificacionSeguidor`
  - `NotificacionEpisodio` (`tipo:'nuevo_episodio'`): `{ id; leida; created_at;
    serie{...}; episodio{...} }` (comportamiento F019 intacto).
  - `NotificacionSeguidor` (`tipo:'nuevo_seguidor'`): `{ id; leida; created_at;
    seguidor: { username } }`.
- `listMisNotificaciones`: query por `usuario_id` (ya no filtra nulls con
  `conRelaciones`); discrimina por `tipo`; para `nuevo_seguidor` resuelve el
  `username` con un lookup por `seguidor_id`. Orden `created_at desc`.
- `marcarLeida`, `marcarTodasLeidas`, `contarNoLeidas`: **sin cambios**
  (operan sobre `id`/`usuario_id`/`leida`, independientes de `tipo`).
- `notificarNuevoSeguidor(serviceRoleClient, seguidoId, seguidorId)` — NOT-09:
  insert `{ usuario_id: seguidoId, seguidor_id: seguidorId,
  tipo:'nuevo_seguidor', episodio_id: null, serie_id: null }` (sin UNIQUE →
  cada follow añade fila nueva). Sin autofollow (lo bloquea M15 antes).

### 3. Integración en `lib/sigue-usuarios.ts`
- `seguirUsuario(client, serviceRoleClient, seguidorId, seguidoId)`:
  tras insert exitoso (no es 23505), `notificarNuevoSeguidor(
  serviceRoleClient, seguidoId, seguidorId)`. Si lanza → `console.error` y
  continúa (D25; el follow ya existe, no se revierte).
- Actualizar `lib/sigue-usuarios-actions.ts`: `accionSeguirUsuario` crea
  `createServiceRoleClient()` y lo pasa a `seguirUsuario`.

### 4. `app/perfil/notificaciones/page.tsx` (extensión)
- Render por `tipo`:
  - `nuevo_episodio` → "Nuevo episodio en <serie>" + "T<s> E<n> — <titulo>"
    (existente, icono `Bell`).
  - `nuevo_seguidor` → `"<username> empezó a seguirte"` + `<Link
    href="/usuarios/<username>">ver perfil</Link>` (icono `UserPlus`).
- Timestamp es-ES `Intl.DateTimeFormat` (ya existente en la página, se reutiliza).

## Archivos a crear/modificar

### Nuevos
1. `supabase/migrations/<ts>_alter_notificacion_tipos.sql` — M16.
2. `tests/db/notificaciones-seguidores-rls.test.ts` — invariantes + RLS + backfill.

### Modificar
1. `lib/notificaciones.ts` — modelo unión + `notificarNuevoSeguidor` +
   `listMisNotificaciones` heterogénea.
2. `lib/sigue-usuarios.ts` — `seguirUsuario` integra notificación.
3. `lib/sigue-usuarios-actions.ts` — pasa serviceRoleClient.
4. `app/perfil/notificaciones/page.tsx` — render por tipo + link.
5. `types/database.ts` — regenerado (`npm run gen:types`).
6. `tests/db/notificaciones.test.ts` — ajustar por cambio de esquema si preciso.
7. `tests/lib/sigue-usuarios.test.ts` — seguir genera notificación.
8. `tests/lib/notificaciones.test.ts` — (nuevo) generación/listado/marcar/no-idempotente.
9. `e2e/notificaciones-seguidores.spec.ts` — (nuevo).
10. `e2e/global-setup.ts` — `wipe()` borra `notificacion` de tipo seguidor (residuos).
11. `ROADMAP.md`, `DECISIONS.md` (D29), `docs/memory/session-log.md` (cierre T6).

## Riesgos técnicos
| Riesgo | Mitigación |
|--------|------------|
| `serie_id` NOT NULL rompe insert de `nuevo_seguidor` | M16 lo hace nullable (hallazgo 2); test de insert con serie_id/episodio_id null |
| UNIQUE global v/s por tipo (romper NOT-07 o NOT-11) | UNIQUE global `(usuario_id, episodio_id)` mantenida: NULLs no colisionan (NOT-11) y episodio no-nulo da idempotencia (NOT-07); sin índice parcial para no romper el upsert de F019 |
| Backfill de filas existentes (todas nuevo_episodio) | `update … set tipo='nuevo_episodio', seguidor_id=null` antes de añadir las nuevas columnas |  
| Join heterogéneo en `listMisNotificaciones` (serie/episodio vs seguidor) | Discriminated union por `tipo` + lookup de username por `seguidor_id`; sin `conRelaciones` global |
| Fallo de notificación no debe romper el follow | log-and-continue (D25); test: DB de notificación caída → follow sigue creado |
| Auto-follow / residuos en notificacion | CHECK M15 + backstop app-side; `wipe()` ampliado en global-setup |

## Qué NO harás (fuera de alcance)
- Notificaciones de "dejó de seguirte" / por comentarios / listas
- Agrupación ("3 personas empezaron a seguirte")
- Preferencias (desactivar notificaciones de seguidores)
- Modificar el RLS de `notificacion` para insert autenticado
- Cambiar `marcarLeida`/`marcarTodasLeidas`/`contarNoLeidas` (operan por id)
- Migraciones fuera de M16
- Commits ni tag (solo con orden explícita)
