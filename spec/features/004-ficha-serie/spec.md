# 004 — Ficha de serie

## Contexto
Segunda feature de UI de detalle. No requiere login. Usa el modelo de F002
(M1-M4) y las queries de F003 como base. Datos: vacíos hasta F007 (seed).
La ficha SOLO es accesible para series con moderation_status = 'aprobada';
cualquier otro estado o slug inexistente devuelve 404.

## Ruta
- `/series/[slug]`: ficha completa de una serie.

## Requisitos (EARS)
- FIC-01: Cuando un visitante accede a /series/<slug> y la serie existe con
  moderation_status='aprobada', el sistema deberá mostrar la ficha completa:
  portada (o placeholder), titulo, categoria, estado (activa/finalizada),
  anio_inicio/anio_fin, descripcion, canales participantes con rol,
  valoracion agregada (AVG + conteo o "Sin valoraciones"), playlist_url
  como enlace externo si existe, y listado de episodios agrupados por temporada.
- FIC-02: Cuando la serie tiene episodios, el sistema los mostrará agrupados
  por temporada con headers ("Temporada 1", "Temporada 2", …). Cada episodio
  se mostrará como un enlace externo a https://www.youtube.com/watch?v=<video_id>
  que abre en nueva pestaña (target="_blank" rel="noopener noreferrer").
  Mostrará numero, titulo, thumbnail (img.youtube.com/vi/<video_id>/hqdefault.jpg)
  y no habrá embeds ni iframes.
- FIC-03: Cuando la serie no tiene episodios, el sistema mostrará un empty
  state "Aún no hay episodios registrados".
- FIC-04: Cuando el slug no existe o la serie tiene moderation_status distinto
  de 'aprobada', el sistema devolverá 404 mediante notFound() de Next.js.
- FIC-05: Cuando se renderiza el reparto, cada canal participante se mostrará
  con su rol (principal/colaborador/invitado) y avatar (si existe, placeholder
  si no), enlazando a /series?canal=<handle> (filtro de F003).
- FIC-06: Cuando la serie tiene valoraciones, se mostrará AVG(nota) a 1 decimal
  + conteo. Con 0 valoraciones mostrará "Sin valoraciones". La fórmula WR y la
  distribución de notas llegan en F009.
- FIC-07: Todos los datos se servirán mediante Server Components. Los links
  externos a YouTube son <a> nativos (no requieren componente cliente).
- FIC-08: La página tendrá metadatos SEO dinámicos: title "<titulo> · ISWDB",
  description con descripcion de la serie (truncada a 160 chars), OG con
  portada si existe.
- FIC-09: La ficha mantendrá los criterios de Performance de F003: LCP < 2.5s,
  force-dynamic si es necesario, Suspense para secciones que hagan await.

## Criterios de aceptación
- [ ] GET /series/<slug> con serie aprobada existente renderiza la ficha completa.
- [ ] GET /series/<slug-inexistente> devuelve 404 con página de error apropiada.
- [ ] GET /series/<slug> con serie pendiente/rechazada/borrador devuelve 404.
- [ ] Episodios se agrupan por temporada con headers visibles.
- [ ] Cada episodio es un link externo a youtube.com/watch que abre en nueva
      pestaña con rel="noopener noreferrer"; no hay iframes en el HTML.
- [ ] Serie sin episodios muestra empty state.
- [ ] Reparto muestra canales con rol y avatar/placeholder, enlazando a
      /series?canal=<handle>.
- [ ] Valoración agregada se muestra correctamente (AVG + conteo o "Sin valoraciones").
- [ ] Metadata dinámica: title, description, OG presentes en el HTML.
- [ ] Lighthouse manual en /series/<slug>: Performance ≥90, SEO 100, Accessibility ≥95.
- [ ] ./validate.sh en verde.
- [ ] Tests de servidor: query de ficha devuelve datos correctos (serie + episodios
      + canales + valoración) con cliente anon; serie no aprobada → null; slug
      inexistente → null.
- [ ] Test E2E Playwright: navegar desde home → click en tarjeta → ficha renderiza;
      click en episodio → link abre en nueva pestaña; slug inexistente → 404.

## Fuera de alcance
- Sistema de valoraciones con WR y distribución (F009)
- Reseñas (F012)
- Login (F008)
- Búsqueda (F006)
- Seed real (F007)
- Caché de metadatos YouTube vía API (duración, fecha publicación)
- Embeds/iframes de YouTube
- Tabs por temporada (se añaden en F011+ si hay series con 10+ temporadas)
- Curación manual de hero/destacados (F011+)
