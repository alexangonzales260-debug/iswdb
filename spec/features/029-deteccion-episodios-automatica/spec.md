# 029 — Detección automática de episodios nuevos

## Contexto
Feature L3. Permite la detección automática de episodios nuevos a partir del
título de un vídeo de YouTube sugerido para una serie. Los episodios se
sugieren mediante una cola que gestionan los moderadores. Tabla
`episodio_sugerencia` (M24) con RLS (solo insert service_role, select/update/delete mods).
Sin notificaciones, sin cron, sin rate-limiting.

## Rutas
- `/admin/sugerencias-episodios`: panel para moderadores con lista de sugerencias
  pendientes, botones para aprobar/rechazar y parsing de temporada/episodio.
- Acciones de servidor para aprobar/rechazar (aprobado → insert en episodio).

## Requisitos (EARS)
- SUG-01: Cuando se detecta un vídeo, el sistema podrá crear una sugerencia en `episodio_sugerencia`.
- SUG-02: Un mod/admin deberá poder listar todas las sugerencias pendientes.
- SUG-03: Un mod/admin deberá poder aprobar una sugerencia para crear el episodio asociado.
- SUG-04: Un mod/admin deberá poder rechazar una sugerencia.
- SUG-05: El sistema detectará patrones de temporada/episodio (ej. S01E01) y extraerá los datos.

## Criterios de aceptación
- [ ] SUG-01: Tabla creada con campos necesarios e índices adecuados.
- [ ] SUG-02: RLS implementada correctamente (solo mods/service_role).
- [ ] SUG-03: Lógica de detección funciona con patrones SXXEXX, EP, CAPÍTULO, etc.
- [ ] SUG-04: Panel admin muestra sugerencias correctamente.
- [ ] SUG-05: Aprobación crea episodio y marca sugerencia como aprobada.
- [ ] Tests de lógica de detección y tests de DB/RLS.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones automáticas por episodios nuevos.
- Rate limiting.
- Historial de modificaciones.
- Cron automático.
