# 002 — Plan técnico (aprobado)

Aprobado con ajustes obligatorios (seguridad, columnas, RLS, tests estrictos).
Spec de referencia: `spec/features/002-data-model/spec.md`.

## Migraciones (3 archivos en `supabase/migrations/`, orden fijo)

### M1 `..._create_catalog_tables.sql`
- Función genérica `set_updated_at()` (trigger de updated_at).
- `categoria`: id uuid PK · nombre text NOT NULL UNIQUE · created_at timestamptz default now().
- `canal`: id uuid PK · nombre text NOT NULL · handle text NOT NULL UNIQUE · avatar_url text · created_at.
- `serie`: id uuid PK · titulo text NOT NULL · slug text NOT NULL UNIQUE · descripcion text ·
  portada_url text · categoria_id uuid NOT NULL FK→categoria · playlist_url text ·
  estado text NOT NULL CHECK ('activa','finalizada') DEFAULT 'activa' ·
  anio_inicio smallint · anio_fin smallint ·
  CHECK (anio_inicio IS NULL OR anio_fin IS NULL OR anio_fin >= anio_inicio) ·
  moderation_status text NOT NULL CHECK ('borrador','pendiente','aprobada','rechazada') DEFAULT 'aprobada' ·
  created_at · updated_at · trigger set_updated_at.
- `episodio`: id uuid PK · serie_id uuid NOT NULL FK→serie ON DELETE CASCADE ·
  temporada int NOT NULL DEFAULT 1 · numero int NOT NULL · titulo text NOT NULL ·
  video_id text NOT NULL · UNIQUE(serie_id,temporada,numero) · UNIQUE(serie_id,video_id) · created_at.
  Índice explícito en `video_id` (el UNIQUE compuesto empieza por serie_id y no cubre
  búsquedas solo por video_id).
- `participa`: serie_id uuid FK→serie CASCADE · canal_id uuid FK→canal CASCADE ·
  PK(serie_id,canal_id) · rol text NOT NULL CHECK ('principal','colaborador','invitado')
  DEFAULT 'colaborador' · created_at.

### M2 `..._create_social_tables.sql`
- `usuario`: id uuid PK FK→auth.users(id) ON DELETE CASCADE ·
  rol text NOT NULL CHECK ('user','mod','admin') DEFAULT 'user' · created_at.
- `valoracion`: id uuid PK · user_id uuid NOT NULL FK→usuario CASCADE ·
  serie_id uuid NOT NULL FK→serie CASCADE · nota int NOT NULL CHECK (nota BETWEEN 1 AND 10) ·
  UNIQUE(user_id,serie_id) · created_at · updated_at · trigger set_updated_at.

### M3 `..._rls_and_triggers.sql`
- `is_admin_or_mod()`: `SECURITY DEFINER` · `STABLE` · `SET search_path = public`;
  `select exists(... where id = auth.uid() and rol in ('mod','admin'))` → false si no hay fila.
- `prevent_self_role_escalation()`: `SECURITY DEFINER`;
  trigger `BEFORE UPDATE ON usuario FOR EACH ROW WHEN (NEW.rol IS DISTINCT FROM OLD.rol)`;
  lanza excepción si `auth.uid() = OLD.id AND NOT is_admin_or_mod()`.
- RLS habilitado en las 7 tablas:
  - canal/categoria/serie/episodio/participa: SELECT → anon+authenticated;
    INSERT/UPDATE/DELETE → authenticated USING/WITH CHECK `is_admin_or_mod()`.
  - valoracion: SELECT → anon+authenticated (lectura pública);
    INSERT/UPDATE/DELETE → authenticated con `user_id = auth.uid()`.
  - usuario: SELECT → authenticated; INSERT WITH CHECK `id = auth.uid()`;
    UPDATE/DELETE solo fila propia (`id = auth.uid()`), protegida por el trigger.

## Índices
- Implícitos vía UNIQUE: serie.slug · canal.handle · valoracion(user_id,serie_id) ·
  episodio(serie_id,temporada,numero) · episodio(serie_id,video_id).
- Explícito: episodio.video_id.

## Tipos
- `npx supabase init` → `supabase/config.toml` (no existe hoy).
- Script `gen:types`: `supabase gen types typescript --local --schema public > types/database.ts`
  (requiere stack arriba). tsconfig ya cubre `types/`.

## Tests (Vitest, estrictos, contra BD local)
- Helper `tests/db/env.ts`: URL/anon/service_role desde env con defaults locales estándar
  de Supabase (claves públicas de dev local, comentadas como tales).
  Si el ping a la BD falla en beforeAll → `throw new Error("BD local no disponible → ejecuta supabase start")`
  (fail fast, sin skipIf).
- Usuarios de test creados vía GoTrue admin API local (fetch + service_role, `email_confirm=true`)
  y login con supabase-js.
- Invariants: nota 0 y 11 rechazadas · UNIQUE(serie,temporada,numero) · UNIQUE(serie,video_id) ·
  slug duplicado · handle duplicado · UNIQUE(user,serie) en valoracion ·
  CHECKs de estado, moderation_status y participa.rol ·
  anio_fin < anio_inicio con ambos presentes → error de BD.
- RLS anon: SELECT ok en catálogo y valoracion; INSERT/UPDATE/DELETE denegados en catálogo y valoracion.
- RLS authenticated sin fila en usuario (is_admin_or_mod=false): escritura en catálogo denegada.
- Authenticated normal: insertar valoracion propia ok; fila ajena denegada.
- Admin (fila usuario rol='admin'): escritura en catálogo ok.
- Auto-escalada: usuario normal UPDATE de su propio rol → excepción;
  admin UPDATE de su propio rol → ok (excepción del trigger).

## Archivos que se tocarán
`supabase/config.toml` (nuevo) · 3 migraciones nuevas · `types/database.ts` (generado) ·
`package.json` (script `gen:types` + `@supabase/supabase-js` en dependencies, ya aprobado
en CONSTRAINTS) · `tests/db/*.test.ts` (nuevos) · `docs/memory/session-log.md`.
Al cierre: DECISIONS.md (D10–D13), ROADMAP.md (estado 002) y docs/memory/open-questions.md.

## Riesgos
- `validate.sh` exige stack Supabase local (Docker) arriba: fail fast intencional.
- `gen types --local` y `db reset` también requieren stack arriba.
- Tests de usuarios dependen del GoTrue local; mitigado creando usuarios por admin API
  con confirmación forzada.
- La política de escritura en `usuario` es solo fila propia: un admin no puede cambiar el
  rol de otro usuario por RLS (solo vía service_role o política futura en 008/011).
  Anotado en open-questions.
- Migración aplicada no se edita: corrección = migración nueva encima.

## Qué NO se hará
- Sin seed (007), sin auth (008), sin UI ni server actions (003+), sin YouTube API,
  sin cola de moderación (F011), sin Storage.
- Sin dependencias fuera del stack · sin tocar `validate.sh` ·
  sin redactar D10–D13 hasta el cierre · sin columnas extra fuera de la lista aprobada
  (p.ej. username en usuario) · sin skips condicionales en tests.

## ADRs al cierre (D10–D13)
- D10: Roles vía `usuario.rol` + `is_admin_or_mod()` (SECURITY DEFINER, STABLE).
- D11: valoracion de lectura pública (anon+authenticated); escritura solo autenticados, fila propia.
- D12: Trigger `prevent_self_role_escalation` sobre usuario (SECURITY DEFINER).
- D13: Tests de BD estrictos: fail fast sin BD local, nada de skipIf.
