# 003 — Catálogo público

## Contexto
Primera feature de UI. No requiere login. Usa el modelo de F002 (M1–M3).
Datos: vacíos hasta F007 (seed). La UI debe verse bien vacía (empty states).
El catálogo público SOLO muestra series con moderation_status = 'aprobada'.

## Rutas
- `/` home: hero + top 5 + últimas 10 + filtros por categoría.
- `/series`: listado con filtros (categoria, canal) y paginación.

## Requisitos (EARS)
- CAT-01: Cuando un visitante anónimo accede a /, el sistema deberá mostrar un
  hero con la serie aprobada mejor valorada, top 5 más valoradas
  (AVG(nota) desc, mínimo 1 valoración, empate por created_at desc),
  últimas 10 añadidas (created_at desc) y enlaces de filtro por categoría.
- CAT-02: Cuando el visitante filtra por categoría vía /series?categoria=<slug>
  (categoria.slug almacenado en BD; migración nueva aprobada en esta spec),
  el listado se reduce a esa categoría manteniendo la paginación.
- CAT-03: Cuando el visitante filtra por canal vía /series?canal=<handle>
  (canal.handle), el listado se reduce a las series donde participa ese canal.
  Ambos filtros combinables con la paginación.
- CAT-04: Cuando el listado supera 12 series, el sistema paginará con
  12 por página mediante ?page=N (N >= 1, offset-based) y controles prev/next.
- CAT-05: Cuando no hay series que mostrar (catálogo vacío, filtro sin
  resultados, o top 5/hero sin valoraciones), el sistema mostrará empty states.
- CAT-06: Cuando se renderiza una tarjeta de serie, mostrará portada
  (placeholder si es null), titulo, anio_inicio, nombre de categoría, canales
  participantes y valoración = AVG(nota) a 1 decimal + conteo; con 0
  valoraciones mostrará "Sin valoraciones". La fórmula WR llega en F009.
- CAT-07: Todos los datos se servirán mediante Server Components; queries en
  lib/ (server). No se expondrá lógica de BD en el cliente.
- CAT-08: Las páginas tendrán metadatos SEO (title, description, OG) dinámicos
  por categoría/canal en /series.
- CAT-09: El sistema tendrá toggle dark/light persistido en localStorage,
  sin dependencias nuevas (script inline en layout para evitar FOUC).
  Tema por defecto: preferencia del sistema.

## Criterios de aceptación
- [ ] GET / renderiza hero + top 5 + últimas 10 + filtros sin errores
      (con BD vacía: empty states visibles).
- [ ] GET /series?categoria=<slug> filtra correctamente.
- [ ] GET /series?canal=<handle> filtra correctamente.
- [ ] GET /series?page=2 devuelve la segunda página (12/página) con prev/next correctos.
- [ ] Series con moderation_status != 'aprobada' NO aparecen en ningún listado
      público (test de servidor).
- [ ] Empty states visibles: catálogo vacío y filtro sin resultados.
- [ ] Lighthouse manual en / y /series: Performance ≥90, SEO 100,
      Accessibility ≥95 (evidencia pegada).
- [ ] ./validate.sh en verde; typecheck + lint sin errores.
- [ ] Tests de servidor: queries de listado devuelven datos correctos
      (filtros + paginación + solo aprobadas) y respetan RLS con cliente anon.
- [ ] Test E2E Playwright: home → filtro → paginación → el enlace de cada
      tarjeta apunta a /series/<slug> (la ficha es F004; solo se verifica href).
- [ ] Toggle dark/light persiste tras recarga sin FOUC.

## Fuera de alcance
Ficha de serie (F004) · Búsqueda (F006) · Seed (F007) · Login (F008) ·
Valoraciones (F009).
