# 016 — Dashboard "Mi actividad"

## Contexto
Feature L2. Unifica toda la actividad del usuario (valoraciones, reseñas,
listas, propuestas) en una página nueva /perfil/actividad. No requiere
migración (usa tablas existentes). Calcula agregados en servidor (RSC).

## Rutas
- `/perfil/actividad`: dashboard de actividad del usuario.

## Requisitos (EARS)
- ACT-01: Cuando un usuario autenticado accede a /perfil/actividad, el sistema
  deberá mostrar sus valoraciones, reseñas, listas y propuestas en un dashboard.
- ACT-02: El dashboard mostrará agregados: total valoraciones, promedio dado,
  total reseñas, total listas, total propuestas.
- ACT-03: Las valoraciones se mostrarán con serie (título, portada), puntuación,
  y fecha, ordenadas por fecha desc.
- ACT-04: Las reseñas se mostrarán con serie (título), extracto del contenido,
  y fecha, ordenadas por fecha desc.
- ACT-05: Las listas se mostrarán con nombre, nº de series, y estado
  pública/privada.
- ACT-06: Las propuestas se mostrarán con título y estado actual
  (pendiente/aprobada/rechazada). Si aprobada, link a la ficha pública.
  Si rechazada, texto "Rechazada" sin link.
- ACT-07: Cuando un visitante sin sesión accede a /perfil/actividad, el sistema
  deberá redirigir a /login (AUTH-06).
- ACT-08: La página /perfil tendrá un link "Ver mi actividad" que enlaza a
  /perfil/actividad.

## Criterios de aceptación
- [ ] Usuario con valoraciones → visible en dashboard.
- [ ] Usuario con reseñas → visible en dashboard.
- [ ] Usuario con listas → visible en dashboard.
- [ ] Usuario con propuestas → visible en dashboard con estado.
- [ ] Agregados calculados correctamente (conteos + promedio).
- [ ] Sin sesión → redirect a /login.
- [ ] /perfil tiene link "Ver mi actividad".
- [ ] Tests de servidor: listMisValoraciones, listMisReseñas, listMisPropuestas.
- [ ] Test E2E: usuario con actividad completa → dashboard muestra todo.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Historial de actividad con timeline/gráfico
- Exportar actividad (CSV/JSON)
- Notificaciones de cambios en propuestas
- Actividad de otros usuarios (perfiles públicos)
- Comparación de actividad entre usuarios
