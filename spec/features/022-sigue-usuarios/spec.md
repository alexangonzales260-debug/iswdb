# 022 — Seguir a usuarios + feed

## Contexto
Feature L2. Complemento de F021: seguir a otros usuarios y ver un feed
cronológico de su actividad pública (reseñas, listas, valoraciones). Tabla
usuario_usuario (M15) con UNIQUE y CHECK anti-autofollow. Feed protegido en
/feed. Sin notificaciones de seguidores, sin bloqueo, sin algoritmo.

## Rutas
- `/usuarios/<username>`: botón "Seguir/Siguiendo" (solo con sesión, no en
  propio perfil) + contadores "Seguidos / Seguidores".
- `/feed`: actividad cronológica de usuarios seguidos (protegida).

## Requisitos (EARS)
- SEG-01: Cuando un usuario autenticado hace click en "Seguir" en el perfil de
  otro usuario, el sistema deberá crear un registro en usuario_usuario.
- SEG-02: Cuando hace click en "Siguiendo", el sistema deberá borrar el
  registro.
- SEG-03: El botón deberá mostrar "Siguiendo" como estado inicial si ya lo
  sigue.
- SEG-04: El perfil público deberá mostrar contadores de seguidos y
  seguidores de ese usuario.
- SEG-05: El botón será visible solo con sesión y NO en el propio perfil.
- SEG-06: Cuando un usuario accede a /feed, el sistema deberá mostrar la
  actividad pública de los usuarios que sigue (reseñas públicas, listas
  públicas, valoraciones) en orden cronológico descendente.
- SEG-07: /feed sin sesión → redirect a /login (AUTH-06).
- SEG-08: Un usuario no podrá seguirse a sí mismo (CHECK en BD).
- SEG-09: Un usuario no podrá seguir dos veces al mismo usuario (UNIQUE).
- SEG-10: Un usuario solo podrá gestionar sus propios follows de usuarios
  (RLS own).

## Criterios de aceptación
- [ ] Seguir/dejar de seguir a otro usuario desde su perfil público.
- [ ] Estado inicial "Siguiendo" correcto.
- [ ] Contadores seguidos/seguidores visibles en el perfil.
- [ ] Botón oculto sin sesión y en el propio perfil.
- [ ] /feed muestra actividad de seguidos en orden desc.
- [ ] /feed sin sesión → redirect a /login.
- [ ] Autofollow rechazado (CHECK); duplicado rechazado (UNIQUE).
- [ ] RLS: solo gestiona follows propios.
- [ ] Tests de servidor: follow/duplicado/self/cascade/RLS/contadores/feed.
- [ ] Test E2E: seguir → feed → dejar de seguir.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de nuevos seguidores
- Bloqueo de usuarios
- Algoritmo en el feed (solo cronológico)
- Lista pública de seguidores/seguidos en el perfil (solo contadores)
- Feed global sin follows
- Mute / silenciar usuarios