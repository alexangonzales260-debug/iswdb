# 021 — Perfil público

## Contexto
Feature L2. Cierra el ciclo social: la actividad (F016) y los follows (F018)
existen pero son privados. El perfil público /usuarios/<username> muestra la
actividad pública de cualquier usuario (reseñas públicas, listas públicas,
valoraciones, series seguidas). Requiere migración M14 para username único.
Sin email ni datos privados.

## Rutas
- `/usuarios/<username>`: perfil público (accesible sin sesión).
- `/perfil`: añade campo username editable + link "Ver mi perfil público".

## Requisitos (EARS)
- USR-01: Cuando un usuario se registra (o existe previamente), el sistema
  deberá generar un username único por defecto derivado del email.
- USR-02: Cuando un usuario edita su perfil, podrá cambiar su username con
  validación de formato (^[a-z0-9_-]{3,20}$) y unicidad.
- USR-03: Cuando un visitante accede a /usuarios/<username>, el sistema deberá
  mostrar el perfil público con series seguidas, valoraciones, reseñas públicas
  y listas públicas del usuario.
- USR-04: Cuando el username no existe, el sistema deberá responder 404
  (notFound).
- USR-05: El perfil público NO mostrará email ni datos privados.
- USR-06: /perfil tendrá un link "Ver mi perfil público" a /usuarios/<username>.

## Criterios de aceptación
- [ ] Registro nuevo genera username único derivado del email.
- [ ] Backfill: usuarios existentes obtienen username único tras M14.
- [ ] Editar username con validación de formato y unicidad (error amigable).
- [ ] /usuarios/<username> muestra actividad pública (seguidas, valoraciones,
      reseñas públicas, listas públicas).
- [ ] Username inexistente → 404.
- [ ] Sin email en el perfil público.
- [ ] /perfil con link "Ver mi perfil público".
- [ ] Tests de servidor: backfill, unicidad, formato, datos públicos, sin email.
- [ ] Test E2E: perfil público + edición de username.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Seguir a usuarios (F022)
- Flags de privacidad (todo público por defecto)
- Avatar / bio / personalización del perfil
- Feed de actividad de seguidos (F022)
- Links desde reseñas/listas al perfil del autor (follow-up)
- Bloqueo de usuarios / moderación de perfiles