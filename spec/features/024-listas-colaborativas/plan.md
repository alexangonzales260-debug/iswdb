# 024 — Listas colaborativas · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Migración M17 con tabla lista_colaborador: lista_id FK lista cascade,
   usuario_id FK usuario cascade, rol text NOT NULL ('editor'|'lector')
   default 'editor', invitado_por FK usuario nullable, created_at.
   UNIQUE(lista_id, usuario_id). RLS: select/insert/update/delete con políticas
   por dueño (creador de la lista) + colaboradores.
2. Invitación por username desde /listas/<id>: el dueño invita con form
   (username + rol), se crea fila en lista_colaborador. Sin notificación
   de invitación (follow-up).
3. Permisos granulares: dueño (todo), editor (añadir/quitar series, renombrar,
   reordenar, cambiar descripción), lector (solo ver, aunque sea privada).
4. UI: sección "Colaboradores" en /listas/<id> con lista de colaboradores,
   form de invitación (solo dueño), botón "quitar" (solo dueño), indicador
   visual "lista colaborativa".
5. MIGRACIÓN M17 APROBADA EXPLÍCITAMENTE (CONSTRAINTS). Alcance: invitación +
   permisos granulares. Sin notificaciones, sin solicitudes, sin transferencia
   de propiedad.

## Verificación previa del esquema (hallazgos)
- `lista.user_id` existe (M9, FK usuario cascade) y es el dueño.
- `lista.es_publica` existe (M9, boolean NOT NULL default false).
- RLS actual de `lista` (M9): `lista_select_own_or_public`
  (es_publica = true OR user_id = auth.uid()) + insert/update/delete own.
- RLS actual de `lista_serie` (M9): select own_or_public e insert/update/delete
  own vía subconsulta al padre `lista` (no tiene user_id).
- No hay migraciones posteriores a M9 que toquen lista/lista_serie. La siguiente
  etiqueta libre es **M17**; el timestamp debe ser posterior a 20260905140000
  (M16). DECISIONS: último D29 → F024 cierra con **D30**. ROADMAP: 023 último.
- `getUsuarioIdPorUsername(clientServiceRole, username)` ya existe y tiene tests
  en lib/sigue-usuarios.ts (F022) → se reutiliza para el lookup de la invitación
  (service_role, D27).
- `createServiceRoleClient()` (D25) disponible para lecturas cross-user.

## Decisión clave: dueño como colaborador explícito
Al crear una lista se inserta, además de la fila en `lista` (user_id = dueño),
una fila en `lista_colaborador` (usuario_id = dueño, rol = 'editor',
invitado_por = NULL). Justificación:
- Un solo lugar para consultar "¿quién puede editar/ver?" → la tabla
  lista_colaborador. `puedeEditarLista`/`puedeVerLista` son uniformes (dueño =
  una fila más con rol editor, protegida de borrado/cambio).
- RLS coherente: las políticas de `lista` y `lista_serie` consultan una única
  fuente de verdad.
- UI de Colaboradores muestra al dueño con su rol, y el indicador "lista
  colaborativa" (nº de editores > 1) es directo.
- `lista.user_id` se conserva como negocio de dueño inalienable: solo el dueño
  elimina la lista y cambia `es_publica` (guardado en trigger, ver decisión 3).

## Decisiones técnicas (justificadas)

### 1. Migración M17 (`<ts posterior a 20260905140000>_create_lista_colaborador.sql`)
```sql
-- M17: tabla lista_colaborador (F024) + RLS
-- Colaboración en listas con roles editor/lector (COL-01..03). El dueño
-- consta como fila explícita (rol editor, invitado_por NULL) al crear la
-- lista. invitado_por → set null si el invitador desaparece (la colab
-- sobrevive). UNIQUE(lista_id, usuario_id) → COL-06 (23505).

create table public.lista_colaborador (
  lista_id uuid not null references public.lista (id) on delete cascade,
  usuario_id uuid not null references public.usuario (id) on delete cascade,
  rol text not null default 'editor' check (rol in ('editor', 'lector')),
  invitado_por uuid references public.usuario (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lista_id, usuario_id)
);

create index lista_colaborador_lista_idx on public.lista_colaborador (lista_id);
create index lista_colaborador_usuario_idx on public.lista_colaborador (usuario_id);

alter table public.lista_colaborador enable row level security;

-- select: el dueño ve todos los colaboradores de sus listas; cada
-- colaborador ve su propia fila (necesario para las subconsultas de RLS).
-- NO se referencia lista_colaborador dentro de su propia policy (evita
-- recursión infinita de RLS); por eso la sección "Colaboradores" con lista
-- completa es del dueño (decisión 4).
create policy lista_colaborador_select_access on public.lista_colaborador
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or exists (select 1 from public.lista
               where lista.id = lista_colaborador.lista_id
                 and lista.user_id = auth.uid())
  );

-- insert: solo el dueño. invitado_por = auth.uid() salvo en la fila del
-- propio dueño (NULL, se crea junto con la lista).
create policy lista_colaborador_insert_owner on public.lista_colaborador
  for insert to authenticated
  with check (
    exists (select 1 from public.lista
            where lista.id = lista_colaborador.lista_id
              and lista.user_id = auth.uid())
    and (lista_colaborador.invitado_por = auth.uid()
         or lista_colaborador.invitado_por is null)
  );

-- update: solo el dueño; no se permite alterar la fila del dueño.
create policy lista_colaborador_update_owner on public.lista_colaborador
  for update to authenticated
  using (exists (select 1 from public.lista
                 where lista.id = lista_colaborador.lista_id
                   and lista.user_id = auth.uid()))
  with check (
    exists (select 1 from public.lista
            where lista.id = lista_colaborador.lista_id
              and lista.user_id = auth.uid())
    and not exists (select 1 from public.lista l
                    where l.id = lista_colaborador.lista_id
                      and l.user_id = lista_colaborador.usuario_id)
  );

-- delete: solo el dueño; la fila del dueño no se puede borrar.
create policy lista_colaborador_delete_owner on public.lista_colaborador
  for delete to authenticated
  using (
    exists (select 1 from public.lista
            where lista.id = lista_colaborador.lista_id
              and lista.user_id = auth.uid())
    and not exists (select 1 from public.lista l
                    where l.id = lista_colaborador.lista_id
                      and l.user_id = lista_colaborador.usuario_id)
  );

grant select on table public.lista_colaborador to authenticated, service_role;
grant insert, update, delete on table public.lista_colaborador to authenticated, service_role;
```
Notas:
- Las policies de `lista` y `lista_serie` se amplían con policies ADICIONALES
  (Postgres OR entre policies del mismo comando), sin tocar las de M9
  (CONSTRAINTS: nunca editar una migración aplicada):
  - `lista_select_collab` (select authenticated):
    `exists(select 1 from lista_colaborador lc where lc.lista_id = lista.id
    and lc.usuario_id = auth.uid())` — cubre editor y lector.
  - `lista_update_editor` (update authenticated):
    using+with check `exists(... lc.rol = 'editor')`. La subconsulta con usa
    `lc.usuario_id = auth.uid()` y `lc.rol = 'editor'`. Con el trigger guard
    (abajo), el con check no permite cambiar user_id ni es_publica ajenos.
  - `lista_serie_select_collab` (select authenticated): misma subconsulta
    (editor y lector pueden leer privadas, COL-03).
  - `lista_serie_insert_editor` / `lista_serie_update_editor` /
    `lista_serie_delete_editor` (authenticated): subconsulta
    `exists(... lc.rol = 'editor')` en using/with check (COL-02, incluye
    reordenar). Sin cambio sobre las policies own de M9 (dueño sigue
    cubierto por ellas).
- Trigger guard `lista_owner_fields_guard` (BEFORE UPDATE on lista):
  - `new.user_id` debe ser igual al old (prohibe transferir propiedad vía
    update de un editor; backstop del RLS).
  - Si `new.es_publica <> old.es_publica` y `auth.uid() <> old.user_id` →
    raise (solo el dueño cambia visibilidad; backstop para no ampliar el
    update de editor). No rompe nada existente: el update propio del dueño
    pasa, y ningún servicio actual cambia user_id ni es_publica tras crear.
- Tras aplicar: `supabase db reset` + `npm run gen:types`.

### 2. Servicios inyectables (lib/listas-colaborativas.ts, nuevo)
Patrón lib/sigue-usuarios.ts/valoraciones.ts. `ERRORES_COLABORADOR`:
`sinSesion, soloAdmin, listaNoEncontrada, usuarioNoEncontrado,
yaEsColaborador, noEsColaborador, noPuedeInvitarse, rolInvalido, noPuedeQuitarDueno`.
- `invitarColaborador(client, listaId, invitorId, username, rol)` — COL-01/05:
  valida rol (editor|lector, Zod) → verifica que `invitorId` es dueño (lectura
  `lista.user_id` con el cliente de sesión) → lookup del target:
  `getUsuarioIdPorUsername(createServiceRoleClient(), username)` (F022,
  service_role, D27). Si el target es el propio dueño → `noPuedeInvitarse`
  (el dueño ya consta como fila). 23505 (UNIQUE) → `yaEsColaborador` (COL-06).
  Insert con `rol` e `invitado_por = invitorId`.
- `quitarColaborador(client, listaId, ownerId, colaboradorId)` — COL-04:
  verifica dueño; rechaza `colaboradorId === ownerId` (`noPuedeQuitarDueno`);
  delete por (lista_id, usuario_id); 0 filas → `noEsColaborador`.
- `cambiarRolColaborador(client, listaId, ownerId, colaboradorId, nuevoRol)` —
  COL-04: verifica dueño; rechaza la fila del dueño; valida rol; update; 0
  filas → `noEsColaborador`.
- `listColaboradores(clientServiceRole, listaId):
  Promise<ColaboradorLista[]>` — para la UI del dueño (service_role, D25).
  Select con embed `usuario ( username )`; tipo `{ usuarioId, username, rol,
  invitadoPor, createdAt }`; sin email.
- `puedeEditarLista(clientServiceRole, listaId, userId): Promise<boolean>` —
  dueño (`lista.user_id === userId`) O colaborador con rol 'editor'
  (→ excluye lector). Lista inexistente → false.
- `puedeVerLista(clientServiceRole, listaId, userId): Promise<boolean>` —
  dueño, cualquier colaborador (editor o lector), o `es_publica = true`.
  Lista inexistente → false.

Tipo exportado: `type RolColaborador = 'editor' | 'lector'`.
`puedeEditarLista`/`puedeVerLista` reciben `clientServiceRole` por parámetro
(Server Actions/tests crean `createServiceRoleClient()`) y las usan los
servicios de escritura de lib/listas.ts para sustituir la comprobación de
"dueño" actual por "dueño o editor".

### 3. Modificaciones en lib/listas.ts
- `crearLista`: tras insertar `lista`, insertar la fila del dueño en
  `lista_colaborador` (`rol='editor'`, `invitado_por=null`). Si esa segunda
  insert falla, borrar la lista recién creada (rollback app-side) y lanzar
  (patrón defensivo; sin RPC, catálogo pequeño, D16).
- `añadirSerieALista`, `quitarSerieDeLista`, `reordenarLista`,
  `renombrarLista`: sustituir la comprobación `lista.user_id !== userId →
  sinPermiso` por `puedeEditarLista(createServiceRoleClient(), ...)` (dueño o
  editor, COL-02). La escritura sigue con el cliente de sesión (el RLS
  nuevo exige rol editor/own).
- `cambiarDescripcionLista(client, id, descripcion)` (nueva, COL-02): Zod
  (nullable/text), requiere puedeEditarLista, update `descripcion`.
- `getLista`: además de `esOwner`, devolver `rol` del usuario actual:
  `'owner' | 'editor' | 'lector' | null`. Con el RLS nuevo, un colaborador de
  lista privada ya obtiene fila (COL-03) y el 404 sigue aplicándose a ajenos
  (COL-07). Determinar el rol: si `userId === user_id` → 'owner'; si no,
  query `lista_colaborador` con el cliente de sesión (select_access deja ver
  la propia fila) → 'editor'|'lector'. `esOwner` se conserva derivado del rol
  para no romper componentes existentes.
- `MisLista` (grid /listas) sin cambios: el grid es "mis listas propias"
  (dueño). Las listas donde colaboras no aparecen ahí (fuera de alcance).

### 4. UI en /listas/<id> (decisión 4)
- `app/listas/[id]/page.tsx` (RSC, force-dynamic): usa `getLista` →
  `notFound()` si no accesible (COL-07). Si el usuario tiene `rol`, calcula
  `esDueno`. Con `rol === 'owner'`: `listColaboradores(createServiceRoleClient(),
  id)`. Pasa a los componentes: `esOwner`, `rol`, `colaboradores`, `listaId`.
- `components/lista-detalle.tsx` (cliente): con `rol` dueño o editor muestra
  los controles de edición (añadir/quitar/reordenar/renombrar/descripción
  vía ListaForm; COL-02); lector solo lectura (aunque lista privada, COL-03);
  indicador "lista colaborativa" si nº de editores (incluido dueño) > 1
  (COL-08).
- `components/colaboradores-lista.tsx` (nuevo, cliente; solo se renderiza con
  `esOwner`): sección "Colaboradores". Lista de filas: username + rol + badge
  "tú" para el dueño; form "Invitar colaborador" (input username + select
  editor/lector) → `accionInvitarColaborador`; por fila botones "quitar" y
  select "cambiar rol" → `accionQuitarColaborador`/`accionCambiarRolColaborador`
  (todos solo dueño, COL-04/05). Editores/lectores NO ven la sección (solo el
  indicador), por la decisión de RLS anti-recursión (decisión 1).

### 5. Server Actions (lib/listas-actions.ts)
- Nuevas, patrón existente (`requireUser` AUTH-06 → `createAuthClient()` →
  servicio → `revalidatePath('/listas/<id>')`; fallo → `{ error }`):
  - `accionInvitarColaborador(listaId, prev, formData)` (useActionState):
    username + rol. `requireUser` → dueño = user.id → `invitarColaborador`.
  - `accionQuitarColaborador(listaId, colaboradorId)` (directa, useTransition).
  - `accionCambiarRolColaborador(listaId, colaboradorId, nuevoRol)` (directa).
- Modificar la validación del dueño en `accionAñadirSerie`, `accionQuitarSerie`,
  `accionReordenar`, `accionRenombrarLista` (nueva `accionCambiarDescripcionLista`)
  para usar los servicios con `puedeEditarLista` (editores, COL-02).
- Revalidación acotada: `/listas/<id>` (+ las de la ficha en añadir/quitar
  serie).

### 6. E2E
e2e/listas-colaborativas.spec.ts (nuevo, ASCII). Se reutilizan
createAuthUserWithUsuario / usernameDesdeEmail / deleteAuthUserByEmail
(cleanup por cascada: usuario→lista→lista_colaborador ambas direcciones).
- A dueño crea lista privada; se verifica que él consta como colaborador en la
  sección.
- A invita a B (editor, por username) vía UI; B (sesión propia) añade serie
  e2e-01 y reordena.
- A cambia a B a 'lector' → B ya no puede editar (sin botones/error).
- A invita a C (lector) → C ve la lista privada pero no edita.
- A quita a B → B ya no la ve (404, COL-07).
- D (ajeno) no puede ver la lista privada ni ve el form de invitar.
- Indicador "lista colaborativa" visible cuando hay >1 editor.
- `e2e/global-setup.ts`: `wipe()` añade `delete from lista_colaborador`
  (limpieza defensiva).

### 7. ADR de cierre
D30 en DECISIONS.md: tabla lista_colaborador (M17), dueño como colaborador
explícito rol editor, roles editor/lector, RLS por dueño+colaboradores (sin
auto-recursión), invitación por username vía service_role (F022),
puedeEditarLista/puedeVerLista como fuente única de permisos, editor no toca
user_id ni es_publica (trigger guard).

## Contexto del repo (breve)
- Patrón de policies con subconsulta al padre lista (M9, D19) — se amplía con
  policies adicionales (OR) para colaboradores sin tocar M9.
- Patrón lookup username→id: getUsuarioIdPorUsername (F022, service_role).
- Patrón lecturas cross-user con createServiceRoleClient (D25).
- Patrón Servicios inyectables + Server Actions + RSC como en F013/F022.

## Orden de tareas (una sesión de Build por tarea)
T1 Migración M17 + gen:types + tests DB/RLS (invariantes + RLS crudo).
T2 lib/listas-colaborativas.ts + ajustes en lib/listas.ts + tests de servicio.
T3 lib/listas-actions.ts (nuevas acciones + validación editor) + componentes.
T4 app/listas/[id]/page.tsx (sección Colaboradores, form, quitar/cambiar rol,
   indicador, visibilidad).
T5 E2E Playwright.
T6 validate.sh + cierre (ROADMAP 024 ✅, DECISIONS D30, session-log; tag F024
   solo con orden explícita).

## Archivos
**Crear**
- spec/features/024-listas-colaborativas/{spec.md,plan.md,tasks.md}
- supabase/migrations/<ts>_create_lista_colaborador.sql (M17)
- lib/listas-colaborativas.ts
- components/colaboradores-lista.tsx
- tests/db/listas-colaborativas-rls.test.ts
- tests/lib/listas-colaborativas.test.ts
- e2e/listas-colaborativas.spec.ts

**Modificar**
- lib/listas.ts (crearLista dueño-fila; puedeEditarLista en escrituras;
  cambiarDescripcionLista; getLista con `rol`)
- lib/listas-actions.ts (3 acciones nuevas + validación editor)
- app/listas/[id]/page.tsx (section + rol + visibilidad)
- components/lista-detalle.tsx (controles por rol + indicador COL-08)
- e2e/global-setup.ts (wipe lista_colaborador)
- types/database.ts (gen:types)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md

## Riesgos técnicos
- **RLS con 3 niveles (dueño/colaborador/público) y auto-recursión**: la
  policy de `lista_colaborador` NO puede referenciarse a sí misma (Postgres
  detecta recursión infinita). Solución: lista completa visible al dueño;
  cada colaborador ve solo su fila; las policies de lista/lista_serie
  consultan SOLO la propia fila (`lc.usuario_id = auth.uid()`). Cubierto por
  tests RLS de T1 (editor/lector/ajeno/anon/dueño).
- **Dueño implícito vs explícito**: resuelto a explícito (fila al crear).
  Riesgo residual: crearLista hace 2 inserts → rollback app-side si falla la
  fila de colaborador; testeado.
- **Lookup username→id**: service_role (F022); usuario inexistente → error
  amigable; target = dueño → rechazo.
- **Permisos granulares**: escrituras de editor pasan por `puedeEditarLista`
  (service_role, app-side) + RLS nuevo (backstop). via libre de edición.
- **Transferencia de propiedad / toggle es_publica**: trigger
  `lista_owner_fields_guard` (user_id inmutable; es_publica solo dueño).
- **Sección Colaboradores para editores**: limitada al dueño por RLS
  (documentado, decisión 1). Si se requiere más adelante → RPC SECURITY
  DEFINER (follow-up).
- **Revalidación acotada**: solo `/listas/<id>` para acciones de
  colaboradores, evitando revalidaciones globales.

## Qué NO haré (fuera de alcance)
- Notificaciones de invitación · solicitudes de colaboración · transferencia
  de propiedad · chat entre colaboradores · historial de cambios por
  colaborador · permisos por serie individual.
- "Mis listas colaborativas" en /listas (grid solo dueño) · invitación desde
  la ficha de serie · enlace a colaboradores públicos para anon.
- RPC a la carta para ver colaboradores (follow-up) · cambios a M9 ni a
  policies ya aplicadas (solo policies adicionales) · dependencias nuevas ·
  commits/tag sin orden explícita.