# 009 — Valoraciones 1–10 + fórmula WR

## Contexto
Feature L2. Permite a usuarios autenticados valorar series de 1 a 10 y
reemplaza el AVG simple por la fórmula WR en los rankings. Usa RLS existente
(D11) y el mecanismo AUTH-06 de F008. No requiere migraciones (valoracion ya
existe con PK user_id+serie_id).

## Requisitos (EARS)
- VAL-01: Cuando un usuario autenticado envía una valoración 1–10 para una
  serie aprobada, el sistema deberá crear o actualizar (upsert) su valoración
  y reflejar el nuevo agregado en la ficha sin recargar.
- VAL-02: Cuando un usuario autenticado elimina su valoración, el sistema
  deberá borrarla y actualizar el agregado.
- VAL-03: Cuando un visitante sin sesión ve la ficha, el selector mostrará
  "Inicia sesión para valorar" enlazando a /login con callback (AUTH-06).
- VAL-04: Cuando se renderiza la ficha, el sistema mostrará AVG + conteo,
  histograma de notas 1–10, y el selector con la nota actual del usuario si
  tiene sesión.
- VAL-05: Los rankings (top 5, hero, orden de /series, filmografía de canal)
  usarán WR = (v/(v+m))*R + (m/(v+m))*C con m=10 y C = media global de series
  aprobadas con ≥1 voto.
- VAL-06: La ficha seguirá mostrando AVG + conteo (no WR) por transparencia.
- VAL-07: Solo usuarios con rol 'user' o superior pueden valorar; un usuario
  no puede valorar series con moderation_status != 'aprobada' (rechazo en
  server action, no solo UI).

## Criterios de aceptación
- [ ] Usuario autenticado valora 1–10 → upsert correcto y agregado actualizado.
- [ ] Usuario cambia su valoración → upsert actualiza la nota.
- [ ] Usuario elimina su valoración → delete correcto y agregado actualizado.
- [ ] Sin sesión → selector muestra "Inicia sesión para valorar" + callback.
- [ ] Ficha muestra AVG + conteo + histograma 1–10.
- [ ] Rankings (top 5, hero, /series, filmografía) ordenan por WR con m=10.
- [ ] Valorar serie no aprobada → rechazo en server action.
- [ ] Tests de servidor: upsert, delete, WR con m=10, C global, rechazo no aprobada.
- [ ] Tests de F003 actualizados al orden WR (top 5/hero).
- [ ] Test E2E Playwright: login → valorar → ver agregado → cambiar → eliminar.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Reseñas con texto (F012)
- Ordenar /series por WR como opción de usuario (solo rankings fijos)
- Caché/materialización de WR (follow-up si escala)
- Valoraciones de usuarios seed editables (son sintéticas)
