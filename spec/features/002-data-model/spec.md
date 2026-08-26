# 002 — Modelo de datos y migraciones iniciales

## Requisitos (EARS)
- MOD-01: El sistema deberá persistir canal, categoria, serie y episodio, con
  serie→categoria (N:1), episodio→serie (N:1 con temporada y número) y
  serie↔canal N:M con rol (participa).
- MOD-02: Cuando se registra una serie, el sistema deberá aceptar playlist_url y
  estado activa/finalizada.
- MOD-03: Cuando se registra un episodio, el sistema deberá almacenar SOLO el
  video_id de YouTube.
- MOD-04: El sistema deberá pre-crear la tabla valoracion (nota 1–10,
  UNIQUE(user_id, serie_id)) y el campo moderation_status en serie
  (borrador/pendiente/aprobada/rechazada, por defecto 'aprobada').
- MOD-05: El sistema deberá permitir lectura pública del catálogo y denegar
  toda escritura sin usuario autenticado con rol admin/mod (RLS).

## Criterios de aceptación
- [ ] Migraciones en supabase/migrations aplican limpias con `supabase db reset`.
- [ ] Tipos TS generados en types/database.ts.
- [ ] Constraints: nota BETWEEN 1 AND 10; UNIQUE(serie_id, temporada, numero);
      slug y handle únicos.
- [ ] Índices: serie.slug, canal.handle, episodio.video_id, valoracion(user_id,serie_id).
- [ ] RLS verificado: SELECT ok para anon; INSERT/UPDATE/DELETE denegados.
- [ ] Tests de las invariantes contra la BD local.
- [ ] ./validate.sh en verde.

## Fuera de alcance
Datos reales (007), auth (008), cualquier UI (003+).