# Session Log

## Sesión 1 — Constitución y bootstrap (F001)
- Elegimos nombre ISWDB y stack: Next.js 15 + Supabase/Postgres + Tailwind 4.
- Scaffold con create-next-app; añadidos scripts `typecheck` y `test`.
- Instalado Vitest y creado test de salud para que la suite arranque verde.
- `validate.sh` configurado como puerta única; quedó en verde.
- Próximo: aprobar spec 002 (modelo de datos) y ejecutar su plan.

## Sesión 2 — 002/T1: entorno Supabase local
- Entorno local usa podman rootless (podman 4.9.3 emulando docker) con
  DOCKER_HOST exportado (unix:///run/user/1000/podman/podman.sock).
- Se creó supabase/snippets/ con .gitkeep para que supabase start levante Studio.
- `supabase init` + `supabase start` en verde; instalado @supabase/supabase-js.

## Sesión 3 — 002/T2–T4: migraciones y tests
- Se serializaron los tests de BD (vitest fileParallelism:false) porque
  catalog/social/rls comparten la BD local con cleanups globales.