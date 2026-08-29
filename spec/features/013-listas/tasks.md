# 013 — Listas personalizadas · Tareas

- [ ] T1 — Migración M9 + tipos + tests DB/RLS
  supabase/migrations/<ts>_create_listas.sql: tabla lista (id uuid PK
  gen_random_uuid(), user_id uuid NOT NULL FK usuario on delete cascade,
  nombre text NOT NULL CHECK char_length 3-100, descripcion text,
  es_publica boolean NOT NULL DEFAULT false, created_at/updated_at
  timestamptz default now()) + trigger lista_set_updated_at (set_updated_at,
  M1) + índice lista_user_idx (user_id) + tabla lista_serie (lista_id uuid
  NOT NULL FK lista on delete cascade, serie_id uuid NOT NULL FK serie on
  delete cascade, posicion integer NOT NULL, added_at timestamptz default
  now(), UNIQUE(lista_id, serie_id)) + índices lista_serie_lista_posicion_idx
  (lista_id, posicion) y lista_serie_serie_idx (serie_id) + grants patrón M2 +
  RLS: lista_select_own_or_public (es_publica = true OR user_id = auth.uid(),
  anon+authenticated), lista_insert_own (with check user_id = auth.uid()),
  lista_update_own / lista_delete_own (using+check user_id = auth.uid()),
  lista_serie_select_own_or_public (subconsulta lista.es_publica OR
  lista.user_id = auth.uid()), lista_serie_insert_own/update_own/delete_own
  (subconsulta lista.user_id = auth.uid()).
  Después: supabase db reset + npm run gen:types (types/database.ts incluye
  lista y lista_serie; verificar .from('lista')/.from('lista_serie')).
  tests/db/listas.test.ts (invariantes + RLS en crudo): nombre 3-100 ok ·
  2/101 → violación de check · trigger updated_at en lista · duplicado
  (lista_id, serie_id) → 23505 · posición next disponible · cascade borrar
  lista → lista_serie y borrar serie → lista_serie · anon lee públicas ok /
  privadas 0 filas · anon INSERT-UPDATE-DELETE denegado · owner insert/update/
  delete propia y su lista_serie ok · ajeno privada no ve ni edita · ajeno no
  inserta series en lista ajena.
  Criterio: npm test -- --run tests/db/listas.test.ts verde (BD local arriba).

- [ ] T2 — Servicios en lib/listas.ts + tests
  lib/listas.ts (nuevo): ERRORES_LISTA · schema Zod (nombre trim 3-100,
  es_publica boolean, descripcion opcional) · usuarioDeSesion interno ·
  crearLista(client, datos): Zod → sesión → insert es_publica=false default
  (LIS-01) · renombrarLista(client, id, nombre) (LIS-02) · eliminarLista(client,
  id) (LIS-03) · añadirSerieALista(client, listaId, serieId): sesión + owner →
  serie existe y aprobada (LIS-04, SELECT con moderation_status='aprobada') →
  posicion 1+MAX → insert (23505 → "Ya está en la lista") · quitarSerieDeLista
  (client, listaId, serieId) (LIS-05) · reordenarLista(client, listaId,
  serieIds): fetch filas actuales → validar mismo conjunto → update posicion
  por fila (LIS-06) · listMisListas(userId) (grid, con nº de series) ·
  getLista(id, userId) → { lista, esOwner } | null si no owner ni pública
  (LIS-07/LIS-08) · getListaPublica(id) (solo lectura anon).
  tests/db/listas.test.ts (extender): happy paths LIS-01..06 · nombre vacío/
  corto/largo → Zod · serie inexistente o no aprobada → rechazo añadir ·
  duplicado → error amigable · sin sesión · reordenar: mismo conjunto ok,
  conjunto incompleto/extra/duplicado → rechazo · owner ve/quita/reordena ·
  ajeno privada → getLista null (404) · ajeno no puede quitar/reordenar ·
  público (visita sin sesión) solo lectura.
  Criterio: npm test -- --run verde.

- [ ] T3 — Server Actions + componentes + páginas + ficha
  lib/listas-actions.ts (nuevo, "use server"): accionCrearLista(prev, formData)
  (useActionState, redirect a /listas/<id>) · accionRenombrarLista(listaId,
  prev, formData) (bind) · accionEliminarLista(listaId) · accionAñadirSerie
  (listaId, serieId) · accionQuitarSerie(listaId, serieId) · accionReordenar
  (listaId, serieIds) (llamadas directas). Todas: requireUser({ next, message })
  (AUTH-06) + createAuthClient() + servicio + revalidatePath(`/listas`,
  `/listas/<id>`, `/series/<slug>`). En fallo devuelven { error }.
  components/lista-form.tsx (nuevo, "use client"): crear/renombrar con
  useActionState (nombre input, descripcion textarea, checkbox es_publica,
  error role=alert).
  components/lista-detalle.tsx (nuevo, "use client"): series en orden manual;
  si esOwner → botones quitar + reordenar (↑/↓) que llaman las acciones;
  si solo lectura → sin botones.
  components/add-to-list.tsx (nuevo, "use client"): dropdown "Añadir a lista"
  con mis listas; null si sin sesión (LIS-10); al añadir llama accionAñadirSerie
  y revalida.
  app/listas/page.tsx (nuevo, RSC, force-dynamic): requireUser({ next:
  "/listas" }) → listMisListas → grid de tarjetas (nombre, nº series,
  público/privado, link a detalle) + ListaForm.
  app/listas/[id]/page.tsx (nuevo, RSC, force-dynamic): getUser + getLista →
  notFound() si no accesible (LIS-08) → ListaDetalle (owner editable o pública
  solo lectura, LIS-07).
  app/series/[slug]/page.tsx: <AddToList serieSlug={serie.slug}
  conSesion={user !== null} /> tras Valoraciones.
  Criterio: lint + typecheck + build verdes; smoke manual en dev (crear/
  renombrar/eliminar/añadir/quitar/reordenar; lista pública anónima; 404
  privada ajena; botón ficha con y sin sesión).

- [ ] T4 — E2E Playwright
  e2e/listas.spec.ts (nuevo; usuarios únicos por ejecución, cleanup
  deleteAuthUser/deleteAuthUserByEmail → cascade usuario→lista→lista_serie):
  flujo login (createAuthUserWithUsuario) → /listas → crear lista ("Favoritas")
  → añadir e2e-01 desde el botón de la ficha → ver en /listas/<id> en orden →
  reordenar (↑/↓) → posición cambiada · hacer pública → logout → visitante
  anónimo ve /listas/<id> solo lectura (sin botones) · privada de otro usuario →
  /listas/<id> → 404 (LIS-08) · sin sesión en /listas → redirect a /login.
  Criterio: npm run test:e2e verde; sin regresiones.

- [x] T5 — validate.sh + cierre
  ./validate.sh completo (salida real pegada) · ROADMAP.md (013 ✅) ·
  DECISIONS.md (D19: modelo lista/lista_serie, RLS own_or_public vía
  subconsulta al padre, sin lista por defecto) · docs/memory/session-log.md
  (sesión F013) · commit atómico `F13: …` tras revisión del diff (DoD #4).
  Criterio: Definition of Done completa.
