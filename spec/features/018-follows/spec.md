# 018 — Seguimiento de series (follow/unfollow)

## Contexto
Feature L2. Permite a usuarios autenticados seguir series (equivalente a la
watchlist de IMDb). El follow es un concepto separado de valoraciones/reseñas/
listas: "quiero estar al tanto de esta serie". Requiere migración M11 para
la tabla usuario_serie + RLS.

## Rutas
- `/perfil/seguidas`: grid de series seguidas (protegida, requiere sesión).
- `/series/<slug>`: ficha con botón "Seguir/Siguiendo" (visible solo con sesión).

## Requisitos (EARS)
- FOL-01: Cuando un usuario autenticado hace click en "Seguir" en la ficha de
  una serie, el sistema deberá crear un registro en usuario_serie con el
  usuario actual y la serie.
- FOL-02: Cuando un usuario autenticado hace click en "Siguiendo" (ya sigue la
  serie), el sistema deberá borrar el registro de usuario_serie.
- FOL-03: Cuando un usuario autenticado accede a la ficha de una serie que ya
  sigue, el botón deberá mostrar "Siguiendo" como estado inicial.
- FOL-04: Cuando un usuario autenticado accede a /perfil/seguidas, el sistema
  deberá mostrar todas las series que sigue, ordenadas por fecha de follow
  descendente, con portada, título y link a la ficha.
- FOL-05: Cuando un visitante sin sesión accede a /perfil/seguidas, el sistema
  deberá redirigir a /login (AUTH-06).
- FOL-06: El botón "Seguir/Siguiendo" en la ficha será visible solo si hay
  sesión (sin sesión no se renderiza).
- FOL-07: Cuando una serie es borrada (cascade), los follows asociados deberán
  borrarse automáticamente (FK ON DELETE CASCADE).
- FOL-08: Un usuario no podrá seguir la misma serie dos veces (UNIQUE en la BD;
  reintento silencioso o error amigable).

## Criterios de aceptación
- [ ] Usuario sigue serie desde ficha → visible en /perfil/seguidas.
- [ ] Usuario deja de seguir serie → desaparece de /perfil/seguidas.
- [ ] Ficha muestra "Siguiendo" cuando ya sigue la serie.
- [ ] /perfil/seguidas sin sesión → redirect a /login.
- [ ] Botón visible solo con sesión en ficha.
- [ ] Duplicado de follow rechazado (UNIQUE).
- [ ] Cascade: borrar serie → follow borrado.
- [ ] Tests de servidor: seguir/dejar/duplicado/cascade/RLS.
- [ ] Test E2E: seguir → /perfil/seguidas → dejar de seguir.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de nuevos episodios (follow-up F019)
- Categorías de seguimiento (favoritas, viendo, completada, pendiente)
- Notas personales en el follow
- Recomendaciones basadas en follows
- Exportar/importar follows
- Perfiles públicos de follows de otros usuarios
