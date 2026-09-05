-- M14: username in public.usuario (F021)
--
-- F021 introduces a unique, human-friendly public profile URL
-- (/usuarios/<username>). The column is added nullable, backfilled from the
-- existing denormalized email (M6), then locked with NOT NULL + UNIQUE + a
-- format CHECK that mirrors the app-side rule (^[a-z0-9_-]{3,20}$).
--
-- Uniqueness of the backfill is deterministic: the sanitized local-part of
-- the email (base, ≤13 chars) plus a short suffix derived from the row id
-- ('-' || left(replace(id::text, '-', ''), 6)). Different users share a base
-- only if they pass different emails with an identical local-part; the
-- id-derived suffix keeps those distinct (16^6 ≈ 16.7M suffix space).
--
-- Sanitization (identical to the TS mirror used by registrarUsuario /
-- asegurarFilaUsuario in lib/auth.ts): unaccent → lowercase → any char
-- outside [a-z0-9_-] collapses to '_' → leading/trailing '_' trimmed →
-- sliced to 13 chars → 'usuario' as fallback base when the local-part is
-- empty after sanitizing (or email is NULL/'').
--
-- RLS is intentionally untouched: public.usuario is own-only (M7,
-- usuario_select_own) with NO anon grant (M2) — no email leak to anon — and
-- public.usuario_serie is own-only (M11). Cross-user reads for the public
-- profile go through the service_role client server-side (D25), so no RLS
-- change is needed.

alter table public.usuario add column username text;

update public.usuario u
set username =
      lower(
        left(
          coalesce(
            nullif(
              trim(both '_' from regexp_replace(
                extensions.unaccent(coalesce(split_part(nullif(u.email, ''), '@', 1), '')),
                '[^a-z0-9_-]+',
                '_',
                'g'
              )),
              ''
            ),
            'usuario'
          ),
          13
        )
      )
      || '-' || left(replace(u.id::text, '-', ''), 6)
where u.username is null;

alter table public.usuario
  alter column username set not null;

alter table public.usuario
  add constraint usuario_username_unique unique (username);

alter table public.usuario
  add constraint usuario_username_len check (username ~ '^[a-z0-9_-]{3,20}$');