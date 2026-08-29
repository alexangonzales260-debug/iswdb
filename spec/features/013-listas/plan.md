# 013 — Listas personalizadas · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Modelo: dos tablas nuevas (migración M9) — `lista` + `lista_serie`, con
   UNIQUE(lista_id, serie_id).
2. CRUD completo: crear/renombrar/eliminar listas + añadir/quitar series + reordenar.
3. Listas públicas o privadas (es_publica, default false).
4. Rutas: /listas (grid) · /listas/<id> (detalle) · botón "Añadir a lista" en ficha.
5. Sin lista por defecto (crear explícitamente).
6. MIGRACIÓN M9 APROBADA EXPLÍCITAMENTE (CONSTRAINTS): dos tablas + RLS.

## Decisiones técnicas (justificadas)
1. **Migración M9 única** (tablas + trigger + índices + grants + RLS; patrón
   M2+M3 y estilo M5, aprobada explícitamente):
   - `lista`: id uuid PK gen_random_uuid(); user_id uuid NOT NULL →
     public.usuario(id) on delete cascade; nombre text NOT NULL;
     descripcion text; es_publica boolean NOT NULL DEFAULT false;
     created_at/updated_at timestamptz NOT NULL DEFAULT now();
     CHECK (char_length(nombre) between 3 and 100) (LIS-01).
   - Trigger `lista_set_updated_at` → public.set_updated_at() (existe en M1).
   - Índices: `lista_user_idx` (user_id) — grid de mis listas (LIS-09);
     el nombre/updated_at se ordenan en TS/catálogo pequeño por diseño.
   - `lista_serie`: lista_id uuid NOT NULL → public.lista(id) on delete cascade;
     serie_id uuid NOT NULL → public.serie(id) on delete cascade;
     posicion integer NOT NULL; added_at timestamptz NOT NULL DEFAULT now();
     UNIQUE(lista_id, serie_id) (aviso de duplicado, 23505).
   - Índices: `lista_serie_lista_posicion_idx` (lista_id, posicion) — orden
     manual del detalle; `lista_serie_serie_idx` (serie_id) — "¿en qué listas
     está esta serie" (follow-up) y FK.
   - Grants patrón M2: select a anon/authenticated/service_role;
     insert/update/delete a authenticated/service_role (service_role fuera
     del RLS para lecturas server-side; RLS restringe al rol cliente).
   - RLS:
     - `lista_select_own_or_public`: for select to anon, authenticated
       using (es_publica = true OR user_id = auth.uid()).
     - `lista_insert_own`: for insert to authenticated
       with check (user_id = auth.uid()).
     - `lista_update_own`: authenticated, using+check (user_id = auth.uid()).
     - `lista_delete_own`: authenticated, using (user_id = auth.uid()).
     - `lista_serie_select_own_or_public`: select to anon, authenticated
       using (lista.es_publica = true OR lista.user_id = auth.uid())
       — subconsulta al padre lista.
     - `lista_serie_insert_own`/`update_own`/`delete_own`: authenticated,
       usando la subconsulta (lista.user_id = auth.uid()) en using/with check.
   - Tras aplicar: supabase db reset + npm run gen:types.
2. **RLS de lista_serie depende del owner via subquery al padre `lista`**
   (no hay user_id en lista_serie). Postgres evalúa la subconsulta sobre
   `lista` respetando el RLS del rol → solo ve las listas que el rol puede
   leer (propias o públicas); para insert/update/delete la condición
   `lista.user_id = auth.uid()` lo restringe al owner. Tests RLS en T1 lo
   verifican (owner vs ajeno vs anon vs pública).
3. **Rechazos app-side (RLS no lo expresa)** — patrón VAL-07/RES-01/F011:
   - LIS-04: añadirSerieALista valida que la serie existe y está aprobada
     (serie_select_public anon solo devuelve aprobadas en F011; con el cliente
     de sesión authenticated lee todo → filtro `moderation_status='aprobada'`
     explícito en el SELECT). Posición = 1 + MAX(posicion) del la lista
     (siguiente disponible, LIS-04).
   - LIS-08: getLista devuelve null si el usuario actual no es owner ni es
     pública → la página lanza notFound() (404, patrón serie por slug).
   - LIS-10: el dropdown necesita mis listas → el servicio listMisListas usa
     el usuario de sesión.
4. **Servicios inyectables** (patrón F008/F009/F011/F012): crearLista/
   renombrarLista/eliminarLista/listMisListas/getLista/getListaPublica/
   añadirSerieALista/quitarSerieDeLista/reordenarLista. Los de escritura
   reciben AuthClient (sesión) y lanzan el usuario de sesión interno
   (patrón usuarioDeSesion de F009); los de lectura usan supabaseServer
   (anon) o reciben el userId del owner. `getLista(id, userId)` devuelve
   la lista solo si es owner o pública (app-side) — el RLS garantiza el resto.
5. **Reordenar (LIS-06)**: reordenarLista(client, listaId, serieIds[]) recibe
   el orden final deseado (array de serie_id en el nuevo orden) y se valida
   que el array contiene EXACTAMENTE las series actuales (mismas filas,
   mismo conjunto). Transacción app-side: fetch de filas actuales → validar
   mismo conjunto → update posicion por fila. UI con botones ↑/↓ que construyen
   el array y lo mandan. Catálogo pequeño por diseño (sin RPC).
6. **Server Actions** (lib/listas-actions.ts, "use server"): patrón
   valoraciones-actions/reseñas-actions. Cada accion: requireUser({ next,
   message }) (AUTH-06, sin sesión → /login con next+msg) → createAuthClient()
   → servicio → revalidatePath() → { error? } en fallo. Firma:
   - accionCrearLista(prev, formData) — useActionState, campos nombre/
     descripcion/es_publica.
   - accionRenombrarLista(listaId, prev, formData) — bind.
   - accionEliminarLista(listaId) — llamada directa (useTransition).
   - accionAñadirSerie(listaId, serieId) — llamada directa.
   - accionQuitarSerie(listaId, serieId) — llamada directa.
   - accionReordenar(listaId, serieIds) — llamada directa.
   - Revalidación acotada: revalidatePath(`/listas`) + revalidatePath(
     `/listas/<id>`) + revalidatePath(`/series/<slug>`) (el botón de la ficha).
7. **Zod (LIS-01)**: nombre → z.string().trim() min(3)/max(100) con mensajes de
   ERRORES_LISTA; posicion en reordenar valida array idempotente (úcnicos).
   La validación de serie aprobada es app-side (decisión 3).
8. **/listas (LIS-09)**: RSC con requireUser({ next: "/listas" }) → listMisListas
   → grid de tarjetas (nombre, nº de series, público/privado) + form crear.
9. **/listas/<id> (LIS-07/LIS-08)**: RSC; getUser() → getLista(id, userId) →
   notFound() si no accesible (privada ajena o inexistente) → render
   componentes. Si es owner: botones quitar/reordenar (cliente). Si es pública
   y no owner: solo lectura.
10. **Botón "Añadir a lista" (LIS-10)**: componente cliente que recibe
    `conSesion` (bool) y serieSlug. Con sesión: dropdown con mis listas y al
    click llama accionAñadirSerie; sin sesión se renderiza null. Nombres de
    archivo ASCII (CONSTRAINTS: código en inglés, UI español): el componente es
    components/add-to-list.tsx aunque la UI sea "Añadir a lista".
11. **E2E**: e2e/listas.spec.ts (nombre ASCII). Se reutilizan helpers existentes
    (createAuthUserWithUsuario, createModUser, deleteAuthUser,
    deleteAuthUserByEmail, FIXTURE con e2e-01). El wipe() de global-setup NO
    toca lista (el seed no crea listas; no hace falta aislar).
12. **ADR**: al cierre se añade D19 a DECISIONS.md (modelo lista/lista_serie,
    RLS own_or_public vía subconsulta al padre, sin lista por defecto).

## Contexto del repo (hallazgos de planificación)
- M1 define public.set_updated_at() (reutilizable). M2/M5 marcan el patrón de
  FKs cascade, unique, grants y trigger updated_at. M3 establece la sintaxis
  de políticas RLS y is_admin_or_mod() (D10), y el patrón usuario_insert_own
  user_id = auth.uid().
- serie_select_public fue dividida por F011 (M8): anon solo aprobada,
  authenticated todas. Para añadirSerieALista el cliente authenticated lee
  todas → el servicio filtra `moderation_status='aprobada'` explícitamente
  (LIS-04).
- Patrón de servicios inyectables con AuthClient y usuarioDeSesion interno:
  lib/valoraciones.ts, lib/reseñas.ts. Patrón Server Actions con requireUser +
  revalidatePath: lib/valoraciones-actions.ts, lib/reseñas-actions.ts.
- Patrón de página protegida RSC con requireUser: app/perfil/page.tsx.
- Patrón ficha con getUser + sección: app/series/[slug]/page.tsx (Valoraciones).
- tests/db: requireLocalDb + fixtures propios con runId + createTestUser/
  signInTestUser/deleteTestUser + db/dbAdmin (patrón propuestas-rls.test.ts).
- e2e/global-setup.ts exporta createAuthUser, createAuthUserWithUsuario,
  createModUser, deleteAuthUser, deleteAuthUserByEmail, getUserIdByEmail y
  FIXTURE (e2e-01, e2e-10). Header no tiene enlace a /listas (se añade solo
  opcional/follow-up; la ruta se alcanza desde /perfil y el botón de ficha).

## Orden de tareas (una sesión de Build por tarea)

### T1 — Migración M9 + tipos + tests DB/RLS
- supabase/migrations/<ts>_create_listas.sql: tabla lista + lista_serie +
  trigger lista_set_updated_at + índices + grants + políticas RLS (decisión 1).
- supabase db reset + npm run gen:types; verificar types/database.ts y que
  .from('lista')/.from('lista_serie') funcionan en supabase-js.
- tests/db/listas.test.ts (invariantes + RLS en crudo): nombre 3-100 ok;
  2/101 → violación de check; trigger updated_at en lista; duplicado
  (lista_id, serie_id) → 23505; posición next disponible; cascade: borrar
  lista → lista_serie borrada; borrar serie → lista_serie borrada.
  RLS: anon lee públicas ok / privadas 0; anon INSERT/UPDATE/DELETE denegado;
  owner insert/update/delete propia ok + lista_serie ok; ajeno privada no ve
  ni edita; ajeno no mete series en lista ajena; desconectado no.
- Verificación: npm test -- --run tests/db/listas.test.ts verde.

### T2 — Servicios en lib/listas.ts + tests
- lib/listas.ts (nuevo): ERRORES_LISTA, schema Zod, crearLista(client, datos)
  (LIS-01: nombre validado, es_publica default false) · renombrarLista(client,
  id, nombre) (LIS-02) · eliminarLista(client, id) (LIS-03) ·
  añadirSerieALista(client, listaId, serieId) (LIS-04: serie existe y
  aprobada; posición = 1+MAX; 23505 → "ya está en la lista") ·
  quitarSerieDeLista(client, listaId, serieId) (LIS-05) ·
  reordenarLista(client, listaId, serieIds) (LIS-06: validar mismo conjunto) ·
  listMisListas(userId) (grid) · getLista(id, userId) → { lista, esOwner }
  o null si no accesible (LIS-07/LIS-08) · getListaPublica(id) (solo lectura
  anon, subconjunto de getLista).
- tests/db/listas.test.ts (extender, patrón valoraciones/reseñas): happy paths
  LIS-01..06, validaciones (nombre vacío/corto/largo → Zod; serie inexistente o
  no aprobada → rechazo), RLS owner vs ajeno vs anónimo vs pública, reordenar
  con conjuntos inválidos, sin sesión.
- Verificación: npm test -- --run verde.

### T3 — Server Actions + componentes + páginas + integración en ficha
- lib/listas-actions.ts (nuevo, "use server"): accionCrearLista (useActionState
  + redirect a /listas/<nuevo id>), accionRenombrarLista, accionEliminarLista,
  accionAñadirSerie, accionQuitarSerie, accionReordenar (llamadas directas),
  con requireUser (AUTH-06) + revalidatePath.
- components/lista-form.tsx (nuevo, "use client"): crear/renombrar con
  useActionState (nombre, descripcion, checkbox es_publica).
- components/lista-detalle.tsx (nuevo, "use client"): lista de series en orden
  manual + botones quitar/reordenar si esOwner (↑/↓ + reordenar por array).
- components/add-to-list.tsx (nuevo, "use client"): dropdown "Añadir a lista"
  con mis listas; null si sin sesión (LIS-10); al añadir revalida.
- app/listas/page.tsx (nuevo, RSC, force-dynamic): requireUser → grid de mis
  listas + ListaForm para crear.
- app/listas/[id]/page.tsx (nuevo, RSC, force-dynamic): getLista → notFound()
  si no accesible → ListaDetalle (owner editable o solo lectura pública).
- app/series/[slug]/page.tsx: <AddToList serieSlug={serie.slug} conSesion={user
  !== null} /> tras <Valoraciones> (decisión 10).
- Verificación: lint + typecheck + build verdes; smoke manual en dev.

### T4 — E2E Playwright
- e2e/listas.spec.ts (nuevo): flujo login → crear lista → añadir e2e-01 → ver
  en detalle → reordenar → lista pública visible para otro usuario → lista
  privada no visible (404/solo lectura).
- Verificación: npm run test:e2e verde; sin regresiones.

### T5 — validate.sh + cierre
- ./validate.sh completo (salida real pegada).
- ROADMAP.md: 013 ✅. DECISIONS.md: D19. docs/memory/session-log.md: sesión F013.
- Commit atómico `F13: …` tras revisión del diff (DoD #4).

## Archivos
**Crear**
- spec/features/013-listas/{spec.md,plan.md,tasks.md}
- supabase/migrations/<ts>_create_listas.sql (M9)
- lib/listas.ts · lib/listas-actions.ts
- app/listas/page.tsx · app/listas/[id]/page.tsx
- components/lista-form.tsx · components/lista-detalle.tsx ·
  components/add-to-list.tsx
- tests/db/listas.test.ts · e2e/listas.spec.ts

**Modificar**
- app/series/[slug]/page.tsx (botón "Añadir a lista")
- types/database.ts (regenerado con gen:types)
- Al cierre: ROADMAP.md · DECISIONS.md · docs/memory/session-log.md
- e2e/global-setup.ts: solo si hiciera falta aislar lista (no: el seed no crea listas)

## Riesgos técnicos
- **RLS con auth.uid() y subconsulta al padre**: lista_serie no tiene user_id;
  las policies dependen de la subconsulta a lista. Postgres aplica el RLS del
  rol dentro de la subconsulta. Cubierto por los tests RLS de T1 (owner, ajeno,
  anónimo, pública) y por los tests de servicio de T2 (getLista devuelve null
  para ajenos → 404).
- **Reordenar con posiciones**: requiere validar que el array de serieIds
  coincide con las series actuales para no crear huecos ni duplicados; catálogo
  pequeño → update posicion por fila en TS (sin RPC). La UI con botones ↑/↓
  reduce el riesgo de arrays incompletos.
- **Listas públicas visibles para anon pero solo owner edita**: cubierto por
  RLS (select own_or_public; insert/update/delete own) + UI (solo owner ve
  botones). Test explícito owner vs público/espectador.
- **Botón en ficha necesita getUser**: la ficha ya llama getUser (cache());
  se pasa conSesion como prop al componente cliente para no duplicar estado.
- **Duplicado serie en lista**: UNIQUE(lista_id, serie_id) → 23505 mapeado a
  "Ya está en la lista"; el dropdown deshabilita la serie ya añadida si es
  factible (se puede dejar como follow-up si el fetch lo complica).
- **Ids con ñ/acentos en nombres de archivo**: se evitan: el componente es
  add-to-list.tsx y los servicios listas.ts (sin ñ), UI en español.

## Qué NO haré (fuera de alcance)
- Listas colaborativas · compartir por enlace privado · duplicar · exportar/
  importar · likes/comentarios en listas públicas · ranking de listas.
- Lista por defecto (se crea explícitamente) · drag-and-drop avanzado (se
  prioriza botones ↑/↓ robustos) · historial de listas por serie · enlace a
  /listas en el header (follow-up) · cambios en /perfil, /login, seed.sql.
- Dependencias nuevas; tocar migraciones ya aplicadas.
