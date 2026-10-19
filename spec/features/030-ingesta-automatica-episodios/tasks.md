# 030 — Ingesta automática de episodios para moderación · Tareas

- [ ] T1 — Lógica de ingesta lib/ingesta-episodios.ts + tests
  Migración: **N/A**. M24 (`20260915120000_create_episodio_sugerencia.sql`) ya crea la
  tabla `episodio_sugerencia` con UNIQUE(serie_id, video_id_youtube), índices y RLS
  mod-only; grants a `service_role` incluidos. No se requiere migración nueva.
  lib/ingesta-episodios.ts (nuevo, server-side):
  - ingestNuevosEpisodios(): lee series activas con playlist_url, llama a
    getVideosRecientes de `lib/youtube.ts` (requiere `YOUTUBE_API_KEY`, ya configurada),
    filtra con detectarPatronEpisodio, inserta en episodio_sugerencia vía
    service_role (bypass RLS), idempotente (UNIQUE). El valor de `YOUTUBE_API_KEY`
    nunca se imprime ni expone.
  tests/lib/ingesta-episodios.test.ts: unitario + db-backed.
  Criterio: npm test -- --run tests/lib/ingesta-episodios.test.ts verde.

- [ ] T2 — Endpoint /api/ingesta-episodios + protección
  app/api/ingesta-episodios/route.ts (nuevo, POST, server-only):
  - Validar `Authorization: Bearer` o sesión admin/mod activa.
  - Llamar a ingestNuevosEpisodios y devolver resumen (procesadas, creadas, omitidas).
  Criterio: lint + typecheck + build verdes; smoke manual.

- [x] T3 — E2E Playwright + DB-backed
  e2e/ingesta-episodios.spec.ts:
  - mod dispara ingesta y ve sugerencias creadas (auth flow).
  - usuario normal/no-mod no puede acceder al endpoint.
  Criterio: npm run test:e2e verde; sin regresiones.
  tests/lib/ingesta-episodios.test.ts (añadido T3):
  - ingestNuevosEpisodios con proveedores falsos de videos y Supabase local real.
  - Prueba determinista de inserción de sugerencia pendiente.
  - Prueba de idempotencia real: reejecución genera 23505 (UNIQUE de M24) → omitidos.
  Nota: Playwright no puede interceptar fetch() server-side; la idempotencia se
  prueba en vitest inyectando IngestaDeps (mínima extensión de signatura, production
  default preservado). Endpoint productivo sin cambios.

- [ ] T4 — Cierre documental
  ROADMAP.md (030 ✅) ·
  docs/memory/session-log.md (sesión F030) · commit atómico
  `F30: …` tras revisión del diff (DoD #4). Tag F30 solo con orden explícita.
  Nota: DECISIONS.md se actualiza solo si se confirma una decisión nueva que lo requiera.
  Criterio: Definition of Done completa.

- [ ] Validate.sh
  ./validate.sh completo (salida real pegada, DoD). Ejecutado tras cierre documental.
