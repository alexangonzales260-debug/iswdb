# 002 — Tareas

Una sesión de Build por tarea. En cada tarea: código + tests en el mismo turno,
verificación real y salida pegada. Plan: `spec/features/002-data-model/plan.md`.

## T1 — Entorno Supabase local
- `npx supabase init` (crea `supabase/config.toml`; migrations/ ya existe).
- `npx supabase start` (Docker) y verificar `supabase status`.
- `npm i @supabase/supabase-js` (dependencies; stack aprobado en CONSTRAINTS).
- Verificación: `supabase status` sano · `npm test` sigue verde (health test).

## T2 — M1 catálogo + tests de invariants de catálogo
- Migración `..._create_catalog_tables.sql`: categoria, canal, serie, episodio, participa
  + `set_updated_at()` + CHECKs (estado, moderation_status, participa.rol,
  anio_fin >= anio_inicio cuando ambos presentes) + UNIQUEs + índice episodio.video_id.
- Helper `tests/db/env.ts` (fail fast: "BD local no disponible → ejecuta supabase start").
- `tests/db/catalog.test.ts`: slug duplicado · handle duplicado ·
  UNIQUE(serie,temporada,numero) · UNIQUE(serie,video_id) · CHECKs de estado y
  moderation_status · CHECK participa.rol · anio_fin < anio_inicio → error.
- Verificación: `supabase db reset` limpio · `npm test` verde (salida pegada).

## T3 — M2 social + tests de invariants sociales
- Migración `..._create_social_tables.sql`: usuario (FK auth.users cascade, rol user/mod/admin),
  valoracion (nota CHECK 1–10, UNIQUE(user_id,serie_id), FKs cascade, updated_at trigger).
- `tests/db/social.test.ts`: nota 0 y 11 rechazadas · UNIQUE(user,serie) ·
  FK de usuario a auth.users.
- Verificación: `supabase db reset` limpio · `npm test` verde (salida pegada).

## T4 — M3 RLS + triggers de seguridad + tests
- Migración `..._rls_and_triggers.sql`: `is_admin_or_mod()` (SECURITY DEFINER, STABLE,
  false sin fila) · `prevent_self_role_escalation()` (SECURITY DEFINER, BEFORE UPDATE
  sobre usuario) · enable RLS en 7 tablas · políticas según plan.md.
- `tests/db/rls.test.ts` (usuarios vía GoTrue admin local + supabase-js):
  anon SELECT ok en catálogo y valoracion · anon writes denegados ·
  authenticated sin fila en usuario → write denegado · authenticated normal:
  valoracion propia ok, ajena denegada · admin write en catálogo ok ·
  auto-escalada denegada a usuario normal y permitida a admin.
- Verificación: `supabase db reset` limpio · `npm test` verde (salida pegada).

## T5 — Tipos TypeScript
- Script `gen:types` en package.json.
- `supabase gen types typescript --local --schema public > types/database.ts`.
- Verificación: `npm run typecheck` verde · types/database.ts refleja las 7 tablas.

## T6 — Cierre y validate.sh
- `docs/memory/session-log.md` (sesión 002) · `docs/memory/open-questions.md`
  (admin no cambia rol ajeno por RLS; se resuelve en 008/011).
- DECISIONS.md: D10–D13 según plan.md · ROADMAP.md: estado de 002.
- Verificación: `./validate.sh` en verde (salida real pegada).
