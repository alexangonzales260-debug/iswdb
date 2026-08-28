# 011 — Propuestas de series · Tareas

- [x] T1 — Migración M8 + tipos + tests RLS
  serie + proponente_email text + user_id uuid null refs usuario (on delete
  set null) · drop serie_select_public → anon solo 'aprobada' +
  serie_select_authenticated (authenticated usando true) · función
  crear_propuesta() SECURITY DEFINER (pendiente + user_id null forzados en
  SQL; serie + participa en una transacción) + revoke execute de public +
  grant execute a anon, authenticated. SIN grants de insert a anon (enmienda
  28-ago: las policies RLS de insert anon+pendiente son inviables porque PG
  exige en el INSERT la visibilidad SELECT del rol). supabase db reset +
  npm run gen:types. tests/db/propuestas-rls.test.ts: anon RPC → serie
  pendiente + participa · anon INSERT directo serie/participa → permission
  denied · anon SELECT pendiente → 0 filas · anon SELECT aprobada → ok · anon
  RPC con canal inexistente → error FK · user RPC → ok · user INSERT directo
  pendiente → RLS denegado · user selección pendiente → ok (VAL-07/RES-01) ·
  mod selección pendiente → ok.
  Criterio: npm test -- --run verde sin regresiones (admin, rls, valoraciones).

- [ ] T2 — lib/propuestas.ts + tests
  schemaPropuesta Zod (titulo 3-200, descripcion 10-5000 requerida, categoria
  slug, proponente_email opcional válido, playlist_url opcional, canales ≥1
  handle+rol) · crearPropuesta: Zod → categoria id → canales por handle (error
  "El canal <handle> no existe en el catálogo") → slug '-prop-<ts>-<rand>' →
  rpc crear_propuesta con canal_ids + roles (una transacción).
  tests/lib/propuestas.test.ts: happy path · moderation_status 'aprobada' en
  el input se ignora (queda pendiente) · canal inexistente · titulo
  vacío/corto → Zod · email inválido → Zod.
  Criterio: npm test -- --run verde.

- [ ] T3 — lib/propuestas-actions.ts ("use server")
  accionProponerSerie(prevState, formData) SIN requireUser: parseo + canales
  JSON → crearPropuesta → revalidatePath('/admin') + redirect
  '/propuesta-enviada' (fuera del try/catch); fallo → { error }.
  Criterio: lint + typecheck verdes.

- [ ] T4 — UI
  app/proponer-serie/page.tsx (RSC force-dynamic, metadata "Proponer serie ·
  ISWDB", getCategorias + EmptyState si vacío) · components/propuesta-form.tsx
  ("use client": useActionState, titulo/descripcion/categoria/canales
  dinámicos (handle sin @ + rol) mín 1/enlace opcional/email opcional,
  validación cliente titulo + canal) · app/propuesta-enviada/page.tsx
  (estático, metadata y mensaje de gracias con links).
  Criterio: lint + typecheck + build verdes; smoke manual en dev.

- [ ] T5 — E2E Playwright
  e2e/propuestas.spec.ts: anónimo → formulario visible → rellenar (canal
  'canal-uno') → submit → /propuesta-enviada "Gracias…" → login mod → /admin
  ve la propuesta → aprueba → visible en /series (PRO-01/07/08). afterAll:
  deleteSeriesBySlugLike('-prop-%') + deleteAuthUser(mod).
  Criterio: npm run test:e2e verde sin regresiones.

- [ ] T6 — validate.sh + cierre
  ./validate.sh (salida pegada) · ROADMAP.md (011 ✅) · DECISIONS.md (D9
  aclarada: F011 con user_id nullable) · session-log.md · commit `F11: …`.
  Criterio: Definition of Done completa.