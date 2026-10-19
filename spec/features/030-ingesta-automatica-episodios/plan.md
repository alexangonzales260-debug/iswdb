# 030 — Ingesta automática de episodios para moderación · Plan técnico

## Decisiones adoptadas (aprobadas por el usuario)
1. Reutilizar `serie.playlist_url` como fuente de vigilar (sin tabla de fuentes nueva).
2. Endpoint `/api/ingesta-episodios` (POST, server-only) como punto de entrada para programador externo.
3. Protección del endpoint: `Authorization: Bearer` con valor de `CRON_SECRET` (desde env); también se admite sesión activa admin/mod.
4. Escritura a `episodio_sugerencia` vía cliente service role (bypass de RLS) desde el backend; no se modifican ni relajan las políticas RLS existentes (M24).
5. Las sugerencias quedan en estado `pendiente`; nunca hay publicación automática sin aprobación de moderador.
6. No nueva migración: M24 ya contiene la tabla, índices y RLS necesarios (ver T1 N/A).

## Verificación previa del esquema (hallazgos)
- `serie.playlist_url` ya existe (M2) y se usa para enlazar playlist de YouTube.
- `episodio_sugerencia` (M24) tiene UNIQUE(serie_id, video_id_youtube) y RLS mod-only.
- `lib/youtube.ts` tiene `getVideosRecientes(playlistId)` server-side y requiere
  la variable de entorno `YOUTUBE_API_KEY` (ya configurada; no se imprime ni expone).
- `lib/episodio-deteccion.ts` tiene `detectarPatronEpisodio(titulo)`.

## Decisiones técnicas (justificadas)
- Endpoint protegido con `Authorization: Bearer` o sesión admin/mod.
- Ingesta idempotente: insert + catch 23505 (UNIQUE) o `upsert` con conflict target.
- Inserción en `episodio_sugerencia` con cliente service role (bypass de RLS); lectura y modificación solo mods.
- Ejecución periódica: el programador externo (frecuencia y proveedor por definir; proponer Vercel Cron como opción sin presentar como aprobado) dispara el endpoint.
- Caché de metadatos de YouTube respetada: solo `playlistItems` reciente, sin descarga de video.

## Archivos
**Crear**
- `app/api/ingesta-episodios/route.ts` (POST, server-only, Bearer token + service role)
- `lib/ingesta-episodios.ts` (lógica de ingesta pura, server-side; usa service role client)
- `tests/lib/ingesta-episodios.test.ts` (unitario + db-backed)

**Extender**
- `lib/youtube.ts` (si necesita soporte para múltiples playlists o paginación)

**Extender docs**
- `ROADMAP.md` (030 ✅)
- `docs/memory/session-log.md` (sesión F030)

## Riesgos técnicos
- Cuota de YouTube Data API v3: uso moderado; la frecuencia de ejecución depende del programador externo (por definir).
- Parsing de títulos propenso a falsos positivos; moderación humana como filtro.
- El programador externo depende del entorno de despliegue (no implementado en la app).

## Configuración / variables de entorno (confirmación del usuario)
- `CRON_SECRET`: token Bearer para proteger el endpoint. Valor por confirmar con el usuario; no se imprime en docs.
- `YOUTUBE_API_KEY`: ya existente, usado por `lib/youtube.ts`.
- Variables de Vercel / scheduler: disponibilidad y configuración del programador externo quedan como confirmación del usuario.

## Qué NO haré
- Cronjob dentro de Next.js (no es serverless-friendly).
- Notificaciones automáticas.
- Historial de moderación.
- Publicación automática sin aprobación de mod.
