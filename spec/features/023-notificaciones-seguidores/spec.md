# 023 — Notificaciones de nuevos seguidores

## Contexto
Feature L2. Complemento de F022: cuando alguien te sigue, recibes notificación.
Usa tabla notificacion existente (M12) con extensión para tipo 'nuevo_seguidor'.
Cada follow genera notificación (no idempotente en el tiempo). Calidad IMDb:
mensajes claros, timestamps formateados, links directos.

## Rutas
- `/perfil/notificaciones`: muestra tanto "Nuevo episodio en <serie>" como
  "<username> empezó a seguirte" (protegida, requiere sesión).

## Requisitos (EARS)
- NOT-09: Cuando un usuario A sigue a B, el sistema deberá generar una
  notificación para B con tipo 'nuevo_seguidor'.
- NOT-10: La notificación deberá mostrar "<username> empezó a seguirte" con
  link al perfil del seguidor (/usuarios/<username>).
- NOT-11: Si A deja de seguir y sigue de nuevo, el sistema deberá generar una
  NUEVA notificación (no idempotente en el tiempo).
- NOT-12: Auto-follow no generará notificación (bloqueado por CHECK en M15).
- NOT-13: Dejar de seguir NO generará notificación.

## Criterios de aceptación
- [ ] Seguir usuario genera notificación "empezó a seguirte".
- [ ] Notificación con link al perfil del seguidor.
- [ ] Dejar de seguir no genera notificación.
- [ ] Seguir de nuevo genera nueva notificación (no idempotente).
- [ ] Auto-follow no genera notificación (bloqueado por CHECK).
- [ ] /perfil/notificaciones muestra ambos tipos con iconos distintos.
- [ ] Tests de servidor: generación, listado, marcar leída, no idempotente.
- [ ] Test E2E: seguir → notificación → click → perfil del seguidor.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de "dejó de seguirte"
- Notificaciones de comentarios en reseñas (F025)
- Notificaciones de listas colaborativas (F024)
- Agrupación de notificaciones ("3 personas empezaron a seguirte")
- Configuración de preferencias (desactivar notificaciones de seguidores)
