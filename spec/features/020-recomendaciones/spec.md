# 020 — Recomendaciones personalizadas

## Contexto
Feature L2. Descubre series nuevas al usuario basándose en sus follows (F018)
y valoraciones altas (F009). Algoritmo simple (no ML): series de la misma
categoría que las seguidas/valoradas, ordenadas por popularidad (nº seguidores).
Se muestra en home ("Recomendado para ti", solo con sesión) y en ficha de
serie ("Series similares"). Sin migración.

## Rutas
- `/` (home): sección "Recomendado para ti" (visible solo con sesión).
- `/series/<slug>`: sección "Series similares" en la ficha.

## Requisitos (EARS)
- REC-01: Cuando un usuario autenticado accede a la home, el sistema deberá
  mostrar una sección "Recomendado para ti" con series basadas en sus follows
  y valoraciones ≥7.
- REC-02: Cada recomendación deberá mostrar la razón: "Porque sigues <serie>"
  o "Porque valoraste <serie>".
- REC-03: Las recomendaciones NO incluirán series ya seguidas o valoradas por
  el usuario.
- REC-04: Cuando un usuario accede a la ficha de una serie, el sistema deberá
  mostrar "Series similares" (misma categoría, excluyendo la actual).
- REC-05: Cuando un visitante sin sesión accede a la home, la sección
  "Recomendado para ti" no se mostrará.
- REC-06: Las recomendaciones se ordenarán por popularidad (nº de seguidores
  de la serie candidata).

## Criterios de aceptación
- [ ] Home con sesión muestra "Recomendado para ti" con series relevantes.
- [ ] Cada recomendación tiene razón ("Porque sigues X" / "Porque valoraste X").
- [ ] Series seguidas/valoradas NO aparecen en recomendaciones.
- [ ] Ficha muestra "Series similares" de la misma categoría.
- [ ] Home sin sesión NO muestra sección de recomendaciones.
- [ ] Orden por seguidores desc.
- [ ] Tests de servidor: algoritmo, razón, límites, caso vacío.
- [ ] Test E2E: home con/sin sesión + ficha.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Recomendaciones basadas en reseñas, listas o propuestas
- "Trending" o "popular global"
- Filtros de usuario (género preferido)
- ML, embeddings o librerías de recomendación
- Caché de recomendaciones (follow-up si catálogo crece)
- Exportar recomendaciones