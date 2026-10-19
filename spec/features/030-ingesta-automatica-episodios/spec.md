# 030 — Ingesta automática de episodios para moderación

## Contexto
Feature L3. Añade la ingesta periódica que alimenta la cola de sugerencias de F029:
revisa las `playlist_url` de series activas, consulta YouTube Data API v3,
filtra títulos con el parser existente y crea sugerencias en `episodio_sugerencia`
evitando duplicados. El moderador sigue aprobando/rechazando; el bot solo alimenta
la cola. No hay notificaciones, ni historial de moderación, ni publicación automática
sin aprobación humana.

## Rutas
- `/api/ingesta-episodios` (POST, protegido): endpoint server-side para disparar la
  ingesta (llamado por programador externo, cron o GitHub Actions).
- Reutiliza `/admin/sugerencias-episodios` de F029 para revisión y aprobación.

## Requisitos (EARS)
- ING-01: Cuando se ejecuta la ingesta, el sistema consulta las playlists de series
  activas que tengan `playlist_url` definido. Cada consulta a YouTube Data API v3
  se realiza con la clave almacenada en la variable de entorno `YOUTUBE_API_KEY`
  (ya configurada); el valor secreto nunca se imprime ni expone.
- ING-02: Para cada vídeo nuevo, el sistema intenta detectar temporada/episodio con
  `detectarPatronEpisodio` y crea una sugerencia en `episodio_sugerencia`.
- ING-03: La ingesta es idempotente: la restricción UNIQUE(serie_id, video_id_youtube)
  evita sugerencias duplicadas.
- ING-04: El endpoint requiere autenticación mediante `Authorization: Bearer` con el valor de la variable de entorno `CRON_SECRET`, o sesión activa de admin/mod. Las inserciones a `episodio_sugerencia` se realizan con el cliente de service role (bypass de RLS) desde el backend; no se relajan ni modifican las políticas RLS existentes.
- ING-05: No se publica ningún episodio sin aprobación previa de un moderador. Las sugerencias creadas por la ingesta quedan en estado `pendiente` y nunca se publican automáticamente.

## Criterios de aceptación
- [ ] ING-01: Ingesta lee `playlist_url` de series activas y consulta YouTube API.
- [ ] ING-02: Títulos con patrón detectado crean sugerencia pendiente.
- [ ] ING-03: Reejecutar la ingesta no crea duplicados.
- [ ] ING-04: Endpoint rechazado sin credenciales válidas (`Authorization: Bearer` con `CRON_SECRET` o sesión admin/mod).
- [ ] ING-05: Aprobación moderador → episodio real; rechazo → sin episodio.
- [ ] Tests de lógica de ingesta y endpoint.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Programador interno (cron dentro de la app): el disparo es externo.
- Notificaciones automáticas cuando aparecen sugerencias.
- Historial de moderación.
- Scraping de sitios externos (solo YouTube Data API v3).
