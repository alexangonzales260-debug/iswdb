# 019 — Notificaciones de nuevos episodios

## Contexto
Feature L2. Complemento de F018: cuando un admin añade un episodio a una serie
que el usuario sigue, se genera una notificación. Badge en header con contador
de no leídas + página /perfil/notificaciones. Requiere migración M12 para la
tabla notificacion.

## Rutas
- `/perfil/notificaciones`: lista de notificaciones (protegida, requiere sesión).

## Requisitos (EARS)
- NOT-01: Cuando un admin crea un episodio en una serie con seguidores, el
  sistema deberá generar una notificación para cada seguidor de la serie.
- NOT-02: Cuando un usuario autenticado accede al header, el sistema deberá
  mostrar un badge con el contador de notificaciones no leídas (visible solo
  con sesión).
- NOT-03: Cuando un usuario autenticado accede a /perfil/notificaciones, el
  sistema deberá mostrar sus notificaciones ordenadas por fecha desc, con el
  texto "Nuevo episodio en <serie>".
- NOT-04: Cuando un usuario marca una notificación como leída, el sistema
  deberá actualizar leida = true y el badge del header deberá reflejarlo.
- NOT-05: Cuando un usuario hace click en "Marcar todas como leídas", el
  sistema deberá actualizar leida = true en todas sus notificaciones.
- NOT-06: Cuando un visitante sin sesión accede a /perfil/notificaciones, el
  sistema deberá redirigir a /login (AUTH-06).
- NOT-07: Un usuario no podrá recibir dos notificaciones por el mismo episodio
  (UNIQUE(usuario_id, episodio_id)).
- NOT-08: Un usuario no podrá leer ni marcar notificaciones de otro usuario
  (RLS select/update own).

## Criterios de aceptación
- [ ] Admin crea episodio en serie seguida → notificación generada por seguidor.
- [ ] Badge en header con contador de no leídas (solo con sesión).
- [ ] /perfil/notificaciones muestra lista ordenada por fecha desc.
- [ ] Marcar leída individual funciona y badge actualiza.
- [ ] "Marcar todas como leídas" funciona.
- [ ] Sin sesión → redirect a /login.
- [ ] Duplicado usuario+episodio rechazado (UNIQUE).
- [ ] RLS: usuario no lee/marca notificaciones ajenas.
- [ ] Tests de servidor: generación, listar, marcar, RLS.
- [ ] Test E2E: seguir → admin crea episodio → badge → marcar leída.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de reseñas, follows, propuestas, valoraciones
- Notificaciones por email o push
- Configuración de preferencias de notificación
- Notificaciones de nuevos episodios vía scheduler/cron (solo al crear admin)
- Perfiles públicos de notificaciones
