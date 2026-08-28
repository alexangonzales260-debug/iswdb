# 011 — Propuestas de series (flujo de alta por usuarios)

## Contexto
Feature L2. Permite a visitantes (anónimos o registrados) proponer nuevas
series para el catálogo. Las propuestas entran como pendientes en la cola de
moderación de F010. No requiere login. Usa una columna nueva proponente_email
en serie y user_id nullable (o usuario sistema) para las propuestas anónimas.

## Rutas
- `/proponer-serie`: formulario público de propuesta.
- `/propuesta-enviada`: página de confirmación estática.

## Requisitos (EARS)
- PRO-01: Cuando un visitante completa el formulario de propuesta con los
  campos requeridos, el sistema deberá crear una nueva serie con
  moderation_status='pendiente' y mostrar la página de confirmación.
- PRO-02: Cuando un visitante envía un título vacío o demasiado corto, el
  sistema deberá rechazar con mensaje de error (Zod).
- PRO-03: Cuando un visitante propone un canal que no existe en el catálogo,
  el sistema deberá rechazar con mensaje amigable (no crear canales nuevos).
- PRO-04: El moderation_status de una propuesta será SIEMPRE 'pendiente',
  ignorando cualquier valor que envíe el formulario.
- PRO-05: El proponente_email es opcional; si presente, debe ser un email
  válido; se guarda en la fila de la serie.
- PRO-06: Un visitante anónimo NO puede leer las propuestas pendientes de
  otros usuarios (RLS).
- PRO-07: Un mod/admin verá la propuesta en la cola de /admin y podrá
  aprobarla/rechazarla (F010).
- PRO-08: Tras aprobar, la serie es visible en el catálogo público con los
  datos del proponente.

## Criterios de aceptación
- [ ] GET /proponer-serie muestra formulario público (sin login requerido).
- [ ] Submit válido → redirect a /propuesta-enviada + serie pendiente en BD.
- [ ] Submit con título vacío/corto → error sin navegar.
- [ ] Submit con canal inexistente → error amigable.
- [ ] moderation_status forzado a 'pendiente' (ignora input).
- [ ] Anónimo no puede listar propuestas pendientes (RLS).
- [ ] Mod ve la propuesta en /admin y puede aprobarla.
- [ ] Tras aprobar, la serie es visible en /series.
- [ ] Tests de servidor: crear propuesta, validaciones, RLS, moderation_status
      forzado.
- [ ] Test E2E: anónimo → formulario → propuesta → mod aprueba → visible.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Edición/eliminación de propuestas por el proponente
- Notificaciones al proponente
- Rate limiting / anti-spam
- Creación de canales nuevos en propuestas
- Historial de propuestas
- Campo motivo del rechazo