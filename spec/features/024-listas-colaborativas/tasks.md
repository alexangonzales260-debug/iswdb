# Tasks — Feature 024: Listas colaborativas

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Migración M17 (lista_colaborador) + tipos + tests DB/RLS
**Estado**: Pendiente
**Objetivo**: Tabla de colaboración con UNIQUE, CHECK rol, FKs cascade y RLS
por dueño + colaboradores, sin romper M9.

**Entregables**:
- `supabase/migrations/<ts>_create_lista_colaborador.sql` (M17, timestamp >
  20260905140000):
  1. `create table public.lista_colaborador` (lista_id FK lista cascade,
     usuario_id FK usuario cascade, rol text NOT NULL default 'editor'
     CHECK (rol in ('editor','lector')), invitado_por FK usuario on delete set
     null, created_at, UNIQUE(lista_id, usuario_id)) + índices
     (lista_id) y (usuario_id).
  2. RLS lista_colaborador: select_access (usuario_id = auth.uid() OR
     lista.user_id = auth.uid()), insert_owner (dueño, invitado_por =
     auth.uid() OR null), update_owner / delete_owner (dueño, sin tocar la
     fila del dueño). Grants select a authenticated/service_role; write a
     authenticated/service_role.
  3. Policies ADICIONALES en lista/lista_serie (sin tocar M9): lista_select_
     collab, lista_update_editor, lista_serie_select_collab,
     lista_serie_insert_editor/update_editor/delete_editor (subconsulta
     `lc.usuario_id = auth.uid()` y rol editor donde aplique).
  4. Trigger `lista_owner_fields_guard` BEFORE UPDATE on lista: user_id
     inmutable; es_publica cambiable solo por el dueño (auth.uid()).
- `supabase db reset` + `npm run gen:types` (types/database.ts con
  lista_colaborador; verificar .from('lista_colaborador')).
- `tests/db/listas-colaborativas-rls.test.ts` (invariantes + RLS crudo):
  insert colaborador ok (rol correcto, invitado_por) · UNIQUE (lista_id,
  usuario_id) → 23505 · CHECK rol inválido → 23514 · cascade lista→colab y
  usuario→colab · RLS select: dueño ve todos, colaborador ve su fila, ajeno/
  anon 0 · editor lee/inserta/actualiza/borra series de lista privada ·
  lector lee pero no escribe · ajeno no lee privada ni escribe · dueño invita/
  quita/cambia rol; colaborador no · no se puede borrar/cambiar la fila del
  dueño · update a user_id/es_publica de lista ajena → trigger deniega.
  Criterio: `npm test -- --run tests/db/listas-colaborativas-rls.test.ts`
  verde + `npm run typecheck`.

---

## T2: lib/listas-colaborativas.ts + ajustes en lib/listas.ts + tests
**Estado**: Pendiente
**Objetivo**: Servicios inyectables de colaboración + permisos; escrituras de
F013 abiertas a editores.

**Entregables**:
- `lib/listas-colaborativas.ts` (nuevo, patrón sigue-usuarios/valoraciones):
  ERRORES_COLABORADOR · `invitarColaborador(client, listaId, invitorId,
  username, rol)` (Zod rol → dueño-check → lookup
  getUsuarioIdPorUsername(service_role, F022) → self-rechazo → insert rol +
  invitado_por; 23505 → yaEsColaborador) · `quitarColaborador(client, listaId,
  ownerId, colaboradorId)` · `cambiarRolColaborador(client, listaId, ownerId,
  colaboradorId, nuevoRol)` · `listColaboradores(clientServiceRole, listaId)`
  (embed usuario.username; sin email) · `puedeEditarLista(clientServiceRole,
  listaId, userId)` · `puedeVerLista(clientServiceRole, listaId, userId)`.
  Tipos: `RolColaborador = 'editor' | 'lector'`, `ColaboradorLista`.
- `lib/listas.ts` (modificar): crearLista inserta la fila del dueño en
  lista_colaborador (rol editor, invitado_por null) con rollback app-side
  (delete lista) si falla · añadirSerieALista / quitarSerieDeLista /
  reordenarLista / renombrarLista usan puedeEditarLista en vez de solo dueño ·
  nueva `cambiarDescripcionLista(client, id, descripcion)` (COL-02) ·
  getLista devuelve `rol: 'owner'|'editor'|'lector'|null` (esOwner derivado).
- `tests/lib/listas-colaborativas.test.ts` (nuevo, fixture patrón
  tests/lib/sigue-usuarios.test.ts): invitar ok/duplicado(23505→amigable)/
  rol inválido/username inexistente/self (dueño)/no dueño · quitar (dueño, no
  dueño, no colaborador, no puede quitarse a sí mismo) · cambiar rol (dueño,
  no dueño, fila dueño protegida) · listColaboradores (sin email, orden) ·
  puedeEditarLista/puedeVerLista (dueño, editor, lector, ajeno, pública,
  inexistente) · crearLista con fila dueño · getLista con rol correcto para
  dueño/editor/lector/ajeno.

**Validación**: `npm run lint && npm run typecheck && npm test -- --run
tests/lib/listas-colaborativas.test.ts` verde + `npm test -- --run
tests/db/listas.test.ts` (sin regresiones F013).

---

## T3: Server Actions + componentes (colaboradores + indicador)
**Estado**: Pendiente
**Objetivo**: Invitar/quitar/cambiar rol desde el cliente; validación por rol
en las actions de F013.

**Entregables**:
- `lib/listas-actions.ts` (modificar): `accionInvitarColaborador(listaId, prev,
  formData)` (useActionState; username + rol) · `accionQuitarColaborador(listaId,
  colaboradorId)` · `accionCambiarRolColaborador(listaId, colaboradorId,
  nuevoRol)` (directas). Todas: requireUser({next: '/listas/<id>'}) +
  createAuthClient() + servicio + revalidatePath('/listas/<id>') + { error }.
  Modificar guardas de accionAñadirSerie/Quitar/Reordenar/Renombrar para
  editores (puedeEditarLista) y nueva accionCambiarDescripcionLista.
- `components/colaboradores-lista.tsx` (nuevo, cliente): sección
  "Colaboradores" (solo esOwner): lista username+rol+badge "tú", form invitar
  (input username + select editor/lector), botones quitar y cambiar rol por
  fila. uso de useActionState (invitar) y useTransition (quitar/cambiar rol),
  error role=alert.
- `components/lista-detalle.tsx` (modificar): controles por rol
  (dueño/editor editan; lector/sin-sesión solo lectura); indicador "lista
  colaborativa" si > 1 editor (incluido dueño) (COL-08).

**Validación**: `npm run lint && npm run typecheck && npm run build` verde;
smoke manual de la sección Colaboradores en dev.

---

## T4: app/listas/[id]/page.tsx (visibilidad + sección)
**Estado**: Pendiente
**Objetivo**: Render condicional por rol; 404 ajenos (COL-07); datos de
colaboradores para el dueño.

**Entregables**:
- `app/listas/[id]/page.tsx` (modificar): getLista devuelve rol → notFound()
  si no accesible → si esOwner: `listColaboradores(createServiceRoleClient(),
  id)` → render `<ColaboradoresLista>` + `ListaDetalle` con rol/esOwner.
  Público/sin-sesión: solo lectura (COl-02 no aplica).
- `generateMetadata` consistente (misma lógica de acceso).

**Validación**: `npm run lint && npm run typecheck && npm run build`;
prueba manual: dueño ve sección y edita; editor no ve sección pero edita;
lector ve privada sin editar; ajeno → 404; anon ve pública sin editar.

---

## T5: E2E Playwright
**Estado**: Pendiente
**Objetivo**: Flujo invitar → editar → quitar + lectores + ajenos.

**Entregables**:
- `e2e/listas-colaborativas.spec.ts` (nuevo; usuarios únicos por ejecución,
  cleanup deleteAuthUserByEmail → cascade):
  - A dueño crea lista privada → sección Colaboradores muestra a A como
    editor (badge "tú").
  - A invita a B (editor, username) → B inicia sesión → añade serie e2e-01 y
    reordena en /listas/<id>.
  - A cambia a B a 'lector' → B ya no puede añadir/quitar/reordenar.
  - A invita a C (lector) → C ve la lista privada (COL-03) pero no edita.
  - A quita a B → B recibe 404 en /listas/<id> (COL-07).
  - D (ajeno) no ve la lista privada (404) ni accede a invitar.
  - Indicador "lista colaborativa" visible mientras hay >1 editor (COL-08).
- `e2e/global-setup.ts`: wipe() añade `delete from lista_colaborador`.

**Validación**: `npm run test:e2e e2e/listas-colaborativas.spec.ts` verde; sin
regresiones en e2e/listas.spec.ts / sigue-usuarios.spec.ts.

---

## T6: validate.sh + cierre
**Estado**: Pendiente
**Objetivo**: Puerta única y docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 024 ✅.
- `DECISIONS.md`: D30 (tabla lista_colaborador M17; dueño como colaborador
  explícito; roles editor/lector; RLS por dueño+colaborador sin auto-recursión;
  invitación por username vía service_role/F022; puedeEditarLista/puedeVerLista
  como permiso global; editor no toca user_id/es_publica — trigger guard).
- `docs/memory/session-log.md`: sesión F024.

**Validación**: `./validate.sh` en verde; Definition of Done completa. (El
commit/tag F24 solo se hace con orden explícita.)

---

## Resumen de archivos
### Nuevos (7)
1. `spec/features/024-listas-colaborativas/{spec.md,plan.md,tasks.md}`
2. `supabase/migrations/<ts>_create_lista_colaborador.sql`
3. `lib/listas-colaborativas.ts`
4. `components/colaboradores-lista.tsx`
5. `tests/db/listas-colaborativas-rls.test.ts`
6. `tests/lib/listas-colaborativas.test.ts`
7. `e2e/listas-colaborativas.spec.ts`
### Modificados (7)
1. `lib/listas.ts`
2. `lib/listas-actions.ts`
3. `app/listas/[id]/page.tsx`
4. `components/lista-detalle.tsx`
5. `e2e/global-setup.ts` (wipe)
6. `types/database.ts` (gen:types)
7. `ROADMAP.md` · `DECISIONS.md` · `docs/memory/session-log.md` (cierre)

## Riesgos y mitigaciones
| Riesgo | Mitigación |
|--------|------------|
| RLS 3 niveles + recursión de lista_colaborador | Policies sin auto-referencia; cada colaborador ve su fila; el dueño ve todas; tests T1 |
| Dueño implícito vs explícito | Explícito (fila al crear) + rollback app-side en crearLista |
| Lookup username→id | getUsuarioIdPorUsername service_role (F022); usuario inexistente → amigable; self → rechazo |
| Permisos granulares | puedeEditarLista app-side + RLS backstop + tests |
| Transferencia de propiedad / es_publica | Trigger lista_owner_fields_guard (+ tests) |
| Sección Colaboradores solo dueño | Documentado; extensión futura vía RPC SECURITY DEFINER (follow-up) |
| Revalidación acotada | Solo /listas/<id> en acciones de colaboradores |

## Fuera de alcance (NO se hace)
- Notificaciones de invitación · solicitudes · transferencia de propiedad ·
  chat · historial por colaborador · permisos por serie.
- "Mis listas colaborativas" en /listas · invitación desde ficha · colaboradores
  públicos para anon · RPC para ver colaboradores · cambios a M9 · dependencias
  nuevas · commits/tag sin orden explícita.