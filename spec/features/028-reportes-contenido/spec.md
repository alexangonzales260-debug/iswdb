# 028 — Reportes de contenido

## Contexto
Feature L2. Permite a usuarios autenticados reportar contenido inapropiado
(serie, episodio, reseña o comentario). Sin login, no se puede reportar.
Los reportes quedan en una cola que gestionan mods/admins. Tabla reporte
(M22) con RLS own/mods. Sin notificaciones, sin rate-limiting, sin
historial.

## Rutas
- Acciones/formulario "Reportar": botón que reporta el contenido
  correspondiente (R1).
- `/admin`: (como F010) listado de reportes pendientes y su gestión
  (cambiar estado) para mods/admins.

## Requisitos (EARS)
- REP-01: Cuando un usuario autenticado reporta un contenido (serie,
  episodio, reseña o comentario) con motivo no vacío, el sistema deberá
  crear una fila en reporte con reportador_id = auth.uid() y motivo.
- REP-02: Cuando un usuario no autenticado intenta reportar, el sistema
  deberá impedirlo (bug: botón deshabilitado; defense: RLS insert solo
  authenticated).
- REP-03: El reportador deberá poder leer sus propios reportes (no los de
  otros).
- REP-04: Un mod/admin deberá poder leer todos los reportes y cambiar su
  estado (pendiente → revisado/descartado).
- REP-05: Solo un mod/admin podrá borrar un reporte.
- REP-06: El reportador NO podrá modificar ni borrar su propio reporte
  (flag MODS).
- REP-07: Un reporte identificará el contenido reportado mediante un
  discriminador tipo ('serie'|'episodio'|'reseña'|'comentario').
- REP-08: Un contenido reportado podrá serlo por varios reportadores
  (sin UNIQUE por objetivo).

## Criterios de aceptación
- [ ] REPORT-01: Autenticado crea reporte con reportador_id = auth.uid().
- [ ] REPORT-02: Anónimo no puede insertar reporte (RLS).
- [ ] REPORT-03: Reportador lee sus propios reportes; no los ajenos.
- [ ] REPORT-04: Mod/admin lee todos y cambia estado.
- [ ] REPORT-05: Mod/admin borra reporte; reportador no.
- [ ] REPORT-06: update/delete de CUALQUIER fila por un no-mod (incluida
      la propia) → 0 filas.
- [ ] REPORT-07: discriminator tipo + FK parcial con CHECK de consistencia.
- [ ] REPORT-08: múltiples reportes sobre el mismo contenido permitidos.
- [ ] Tests de servidor: crear/leer/actualizar/borrar reporte, RLS, CHECK.
- [ ] Test E2E: reportar contenido y gestión de mod.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones a mods por reportes nuevos
- Rate limiting / anti-spam de reportes
- Historial de cambios de estado del reporte
- Reportes de listas, valoraciones, usuarios o canales (solo serie/
  episodio/reseña/comentario)
- Bloqueo automático del contenido reportado
- Categorías de motivo fijas (motivo libre, 1-2000)