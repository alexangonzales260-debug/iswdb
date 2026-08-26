# ADRs
- D1 Nombre: ISWDB (Internet Series Web DataBase). Marca en minúsculas, identidad propia.
- D2 BD: Postgres vía Supabase (Auth+Storage+RLS incluidos). Migraciones en repo.
- D3 Front: Next.js 15 App Router + TS strict + Tailwind 4.
- D4 Verificación: Vitest + Playwright; validate.sh como única puerta.
- D5 YouTube: solo embed + img.youtube.com + Data API v3 server-side,
     con caché de metadatos en BD para proteger la cuota.
- D6 Capas: UI → Server Actions/route handlers → lib/ (servicios) → cliente Supabase.
- D7 Sin MCP día 1. Context7 se activa si hay APIs inventadas; Supabase MCP si duele el esquema.
- D8 Idiomas: código/commits inglés, UI/docs español.
- D9 Las series aportadas por usuarios nacerán con estado pendiente y cola de
     moderación (se materializa en F011, L3).
- D10 Roles en BD: tabla usuario.rol + función is_admin_or_mod() (SECURITY DEFINER + STABLE).
     Trigger prevent_self_role_escalation impide auto-escalada.
- D11 RLS valoracion: lectura pública (anon puede ver notas); escritura solo autenticado + fila propia.
- D12 validate.sh estricto: tests de BD requieren stack local arriba; sin skipIf.
     Si BD no disponible, fail fast con mensaje claro.
- D13 Frontera de datos: datos del dominio (título, descripción) se almacenan ahora;
     datos derivados de YouTube (duración, thumbnail, fecha publicación) van a caché en F004.