# 005 — Ficha de canal

## Contexto
Feature L1. No requiere login. Reutiliza el modelo de F002 y el componente
serie-card de F003. La ficha SOLO es accesible para canales con al menos una
serie aprobada en la que participan; canal sin series aprobadas o handle
inexistente devuelve 404.

## Ruta
- `/canales/<handle>`: ficha del canal con su filmografía.

## Requisitos (EARS)
- CAN-01: Cuando un visitante accede a /canales/<handle> y el canal existe
  con al menos una serie aprobada, el sistema mostrará: avatar (o placeholder),
  nombre, handle, conteo de series aprobadas, y listado de series ordenado
  por anio_inicio desc y estado desc (activas antes que finalizadas), con
  desempate por valoración media desc.
- CAN-02: Cuando se renderiza cada serie en la filmografía, se mostrará con
  el componente serie-card existente (reutilizado de F003) más una etiqueta
  visible con el rol del canal en esa serie (Principal/Colaborador/Invitado).
- CAN-03: Cuando el handle no existe o el canal no participa en ninguna serie
  aprobada, el sistema devolverá 404 mediante notFound() de Next.js.
- CAN-04: Todos los datos se servirán mediante Server Components, siguiendo
  el mismo patrón force-dynamic + query previa a render que F004.
- CAN-05: La página tendrá metadatos SEO dinámicos: title "<nombre> · ISWDB",
  description con "<nombre> en ISWDB: X series como <rol-principal>.",
  OG con avatar si existe.

## Criterios de aceptación
- [ ] GET /canales/<handle> con canal con series aprobadas renderiza la ficha.
- [ ] GET /canales/<handle> con canal sin series aprobadas devuelve 404.
- [ ] GET /canales/<handle-inexistente> devuelve 404.
- [ ] Series ordenadas por anio_inicio desc + estado desc + valoración desc.
- [ ] Cada serie muestra la etiqueta del rol del canal (Principal/Colaborador/Invitado).
- [ ] Serie-card reutilizado de F003 (mismos tests verdes).
- [ ] Metadata dinámica: title, description, OG presentes en el HTML.
- [ ] Lighthouse manual: Performance ≥90, SEO 100, Accessibility ≥95.
- [ ] ./validate.sh en verde.
- [ ] Tests de servidor: query devuelve datos correctos; canal sin series
      aprobadas → null; handle inexistente → null.
- [ ] Test E2E Playwright: home o /series → click en canal del reparto → ficha
      del canal; 404 con handle inexistente.

## Fuera de alcance
- Conteo de episodios del canal
- Biografía/descripción del canal
- Página de edición (F008+)
- Reseñas (F012)
- Login (F008)
- Búsqueda (F006)
- Seed real (F007)
