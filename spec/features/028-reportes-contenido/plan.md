# 028 — Reportes de contenido · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Migración M22 con tabla reporte: reportador_id FK usuario cascade,
   tipo (discriminador), FK parcial por tipo con CHECK de consistencia,
   motivo (1-2000), estado enum activo/revisado/descartado
   ('pendiente' default), created_at. FK al contenido on delete cascade
   (si el contenido desaparece, su reporte desaparece).
2. RLS con 4 políticas (flag 5 APROBADO):
   - `reporte_insert_own` → insert to authenticated WITH CHECK
     (reportador_id = auth.uid()).
   - `reporte_select_own_or_mod` → select to authenticated USING
     (reportador_id = auth.uid() OR public.is_admin_or_mod()).
   - `reporte_update_mod` → update to authenticated USING/WITH CHECK
     (public.is_admin_or_mod()).
   - `reporte_delete_mod` → delete to authenticated USING
     (public.is_admin_or_mod()).
   - **SIN** políticas update/delete para el reportador own.
3. **Ajuste flag 5 — DECISIÓN Y RIESGO MITIGADO**:
   UPDATE/DELETE del reporte son EXCLUSIVOS de mods/admins
   (is_admin_or_mod). El reportador NO puede modificar ni borrar su propio
   reporte. Racional: el reporte es una declaración ante moderación (como
   playeras a un juez); permitir que el reportador edite/borre su propio
   reporte permitiría manipular la cola (retractar un reporte legítimo que
   ya estaba siendo revisado, editar el motivo para suavizar una acusación
   real, o borrar evidencia antes de que mod actúe). Al cerrar update/
   delete al rol mod, el reporte es un registro inmutable para el
   reportador y el flujo queda auditado por el rol que gestiona la cola
   (F010). Riesgo mitigado: manipulación de la cola de moderación por el
   reportador. Coste asumido: si el usuario reporta por error, no puede
   retractar; se gestiona vía mod (estado 'descartado').
4. UI: botón/formulario "Reportar" y cola en /admin. Sin notificaciones,
   sin rate-limiting, sin historial.
5. MIGRACIÓN M22 APROBADA EXPLÍCITAMENTE (CONSTRAINTS).

## Verificación previa del esquema (hallazgos)
- Última migración M21 (20260910120000_create_resena_like.sql) →
  siguiente timestamp `20260914120000_create_reporte.sql` (etiqueta M22).
- DECISIONS.md termina en D33 → F028 cerrará con **D34**. ROADMAP: 027
  último → 028 pendiente.
- Patrón de escritura own+select: reseña (M5) y comentario (M19).
  Patrón select own+mod: reseña_delete_own_or_mod (M5). Este feature es el
  primero con update/delete EXCLUSIVOS de mod (sin camino own).
- Patrón discriminador con FK parcial: M16 (notificacion) usa
  serie_id/episodio_id/seguidor_id nullable + CHECK
  notificacion_columnas_por_tipo_check. Se copia ese patrón para reporte:
  serie_id, episodio_id, "reseña_id", comentario_id nullable + CHECK de
  consistencia por tipo.
- Test RLS: patrón likes-rls.test.ts / comentarios-rls.test.ts (beforeAll
  usuarios+contenido, afterAll cleanup). Requiere crear serie/episodio/
  reseña/comentario como objetivos reales.
- goTrue cleanup: deleteTestUser cascade auth.users → public.usuario →
  reporte (FK cascade).
- e2e/global-setup.ts wipe: añadir reporte al wipe (borrar ANTES de
  serie/reseña/comentario por FK? reporte referenciará a esos con CASCADE,
  así que se borra solo; no hace falta entrada extra si el wipe borra
  origen. Si no, añadir delete de reporte tras contenido — se revisa en T4).

## Decisiones técnicas (justificadas)

### 1. Migración M22 (`20260914120000_create_reporte.sql`)
```sql
create table public.reporte (
  id uuid primary key default gen_random_uuid(),
  reportador_id uuid not null references public.usuario (id) on delete cascade,
  tipo text not null check (tipo in ('serie', 'episodio', 'reseña', 'comentario')),
  serie_id uuid references public.serie (id) on delete cascade,
  episodio_id uuid references public.episodio (id) on delete cascade,
  "reseña_id" uuid references public."reseña" (id) on delete cascade,
  comentario_id uuid references public.comentario (id) on delete cascade,
  motivo text not null check (char_length(motivo) between 1 and 2000),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'revisado', 'descartado')),
  created_at timestamptz not null default now(),
  check (
    (tipo = 'serie' and serie_id is not null and episodio_id is null
       and "reseña_id" is null and comentario_id is null)
    or (tipo = 'episodio' and serie_id is null and episodio_id is not null
       and "reseña_id" is null and comentario_id is null)
    or (tipo = 'reseña' and serie_id is null and episodio_id is null
       and "reseña_id" is not null and comentario_id is null)
    or (tipo = 'comentario' and serie_id is null and episodio_id is null
       and "reseña_id" is null and comentario_id is not null)
  )
);
```
Índices: `reporte_reportador_idx (reportador_id, created_at desc)` (lista
propia, REP-03) y `reporte_mod_estado_idx (estado, created_at desc)`
(cola de /admin, REP-04).
Sin updated_at, sin trigger de updated_at.
Grants patrón M2: select/insert/update/delete a authenticated +
service_role; select/insert también a service_role (RLS solo-auth).
Sin anon (REPORT-02): no hay política insert anon porque la única vía de
inserción es autenticada; anon ni siquiera ve la tabla (sin grant).

RLS (flag 5, exacto):
```sql
create policy "reporte_insert_own" on public."reporte"
  for insert to authenticated with check (reportador_id = auth.uid());
create policy "reporte_select_own_or_mod" on public."reporte"
  for select to authenticated
  using (reportador_id = auth.uid() or public.is_admin_or_mod());
create policy "reporte_update_mod" on public."reporte"
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy "reporte_delete_mod" on public."reporte"
  for delete to authenticated using (public.is_admin_or_mod());
```

### 2. Servicios inyectables (lib/reportes.ts, nuevo — T2)
- `crearReporte(client, { tipo, idObjetivo, motivo }, usuarioId)`: insert con
  reportador_id = auth.uid(). La FK parcial se valida en SQL por CHECK.
- `listMisReportes(client, usuarioId)`: select reportador_id = auth.uid().
- `listReportesPendientes(client)`: para mod (is_admin_or_mod via RLS).
- `actualizarEstadoReporte(client, reporteId, estado, usuarioId)`:
  update restringido por RLS mod-only.
- `eliminarReporte(client, reporteId, usuarioId)`: delete mod-only.
- Enriquecimiento on-read con los objetivos (para mostrar "qué contení­a").

### 3. UI (T3)
- Botón/Acción "Reportar" en ficha de serie, episodio, reseña individual y
  comentario. Guard requireUser + sesión. Formulario con motivo (Zod 1-2000).
- `/admin/reportes`: cola de reportes pendientes con cambio de estado
  (aprobado/descartado) para mod/admin (campo select vía Server Action).

### 4. E2E (T4)
- e2e/reportes-contenido.spec.ts: user reporta una serie (no puede
  borrarla); mod entra a /admin/reportes, ve el reporte, lo marca
  revisado. Sin sesión no aparece botón.

## Archivos
**Crear**
- spec/features/028-reportes-contenido/{spec.md,plan.md,tasks.md}
- supabase/migrations/20260914120000_create_reporte.sql (M22)
- lib/reportes.ts · lib/reportes-actions.ts
- components/reportar-button.tsx (+ formulario motivo)
- app/admin/reportes/page.tsx
- tests/db/reporte-rls.test.ts · tests/lib/reportes.test.ts
- e2e/reportes-contenido.spec.ts

**Modificar**
- types/database.ts (gen:types)
- e2e/global-setup.ts (wipe reporte + contenido que referencie)
- Al cierre: ROADMAP.md · DECISIONS.md (D34) · docs/memory/session-log.md

## Riesgos técnicos
- **Discriminador con FK parcial**: tres columnas nullable por fila. El
  CHECK reporte_consistencia asegura exactamente una según tipo. Testeado
  con combinaciones inválidas en T1.
- **update mod-only sin camino own**: riesgo de UX (reporte equivocado no
  retractable). Mitigado documentando costo; estado 'descartado' por mod.
- **FK cascade**: borrar contenido (serie/episodio/reseña/comentario)
  borra sus reportes sin huérfanas; borrar usuario borra sus reportes.
- **Select own_or_mod**: el reportador no ve reportes ajenos; los mods
  ven todos. Sin leaks cross-user.

## Qué NO haré (fuera de alcance)
- Notificaciones a mods de reportes nuevos
- Rate limiting / anti-spam
- Historial de estados
- Reporte de listas/valoraciones/usuarios/canales
- Bloqueo automático del contenido
- Motivos fijos (categorías)
- Commits sin tu orden · tag F28 sin orden explícita