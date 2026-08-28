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
     moderación. La infraestructura de moderación (panel /admin, aprobar/
     rechazar, CRUD de series con canales y episodios) se materializó en F010;
     F011 (L3) aporta el flujo de alta por usuarios.
- D10 Roles en BD: tabla usuario.rol + función is_admin_or_mod() (SECURITY DEFINER + STABLE).
     Trigger prevent_self_role_escalation impide auto-escalada.
- D11 RLS valoracion: lectura pública (anon puede ver notas); escritura solo autenticado + fila propia.
- D12 validate.sh estricto: tests de BD requieren stack local arriba; sin skipIf.
     Si BD no disponible, fail fast con mensaje claro.
- D13: Thumbnail de episodios se deriva de img.youtube.com/vi/<video_id>/hqdefault.jpg
     sin caché en BD (cumple D5: solo embed oficial, sin API de YouTube). La caché
     de metadatos (duración, fecha publicación) se revisita en F007+ si se integra
     YouTube Data API.
- D14 shadcn/ui v4 con runtime package (shadcn, tw-animate-css) como dependencias
     del stack UI. Componentes copiados al repo (no dependencia negra).
     Base color: Zinc. Tokens de marca: --color-brand #E85D04,
     --color-brand-accessible #B04A00.
- D15: URLs de fichas de canal usan el formato /canales/<handle> sin el
     símbolo @ (p.ej. /canales/canal-uno en lugar de /canales/@canal-uno).
     Next.js 16 trata segmentos que empiezan con @ como slots de parallel
     routes, no como valores de parámetros dinámicos. El handle visible en la
     UI conserva el @ (p.ej. @canal-uno), pero las URLs internas y canonical
     lo omiten. Helper handleDesdeUrl/handleParaUrl en lib/canales.ts.
- D16: Los valores derivados (WR, C global, histogramas, conteos) se
  calculan en lectura server-side, sin caché ni materialización, mientras
  el catálogo sea pequeño (≤100 series). Si escala, se añade caché/
  materialización como follow-up, no como requisito inicial. Coherente con
  D11 (valoracion pública) y D13 (thumbnails derivados).
- D17: La búsqueda usa funciones RPC de Postgres (public.buscar_series /
     public.buscar_canales) con extensión unaccent e ILIKE, SECURITY INVOKER
     y search_path fijado. El escape de comodines (%/_/\) vive en SQL.
     Filtrado en BD (no fetch-all) por escalabilidad; RLS intacto vía invoker.