# 007 — Seed: series reales

## Contexto
Feature L1. Rellena el catálogo con datos realistas para validar el stack
construido (F002-F005) y dar contexto real a futuras features (F006 búsqueda,
F009 valoraciones). No requiere login. No toca esquema, RLS ni queries.

## Decisiones adoptadas
1. Series reales del ecosistema hispanohablante (Minecraft, GTA, Roleplay,
   Terror, Animación).
2. 20-30 series con 2-5 episodios cada una.
3. Portadas y thumbnails derivados de video_id (img.youtube.com/vi/<id>/hqdefault.jpg).
4. Valoraciones con distribución realista: 5-7 muy valoradas (8.5-9.5, 10-20 votos),
   10-15 medias (6.0-8.0, 3-8 votos), 5-8 con pocas/ninguna. Empates intencionales
   en el top 5 para probar desempate por created_at.
5. Mecanismo: supabase/seed.sql + script npm run db:seed.

## Requisitos (EARS)
- SEED-01: Cuando se ejecuta supabase db reset, el sistema aplicará las
  migraciones M1-M4 y luego el seed, dejando el catálogo con 20-30 series
  aprobadas, 5 categorías, 8-10 canales, episodios y valoraciones.
- SEED-02: El seed será idempotente (ON CONFLICT DO NOTHING) para no fallar
  si se ejecuta dos veces.
- SEED-03: Los datos usarán video_ids reales de YouTube para que thumbnails
  y portadas sean válidos.
- SEED-04: El seed NO interferirá con los tests de BD (que hacen wipe en
  beforeAll); tras supabase db reset el catálogo queda con datos, y los tests
  lo limpian para su ejecución.

## Criterios de aceptación
- [ ] supabase db reset aplica migraciones + seed sin errores.
- [ ] El catálogo / y /series muestran series reales con portadas válidas.
- [ ] /series tiene 2+ páginas (paginación visible con datos reales).
- [ ] Top 5 y hero muestran series muy valoradas; empates resueltos por created_at.
- [ ] Series sin valoraciones muestran "Sin valoraciones".
- [ ] Fichas /series/<slug> y /canales/<handle> renderizan con datos reales.
- [ ] npm run db:seed ejecuta el seed sin errores (idempotente).
- [ ] ./validate.sh en verde (tests hacen wipe y no dependen del seed).
