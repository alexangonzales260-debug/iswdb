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
     F011 (L3) aporta el flujo de alta por usuarios. El alta anónima se modela
     con user_id NULLABLE en serie (no con un "usuario sistema"): una propuesta
     anónima deja user_id = NULL y el contacto en proponente_email; la
     escritura pasa solo por la función crear_propuesta() SECURITY DEFINER.
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
- D18: Reseñas con publicación directa (sin moderation_status). El autor
     debe haber valorado la serie (check server-side). Mod/admin puede borrar
     cualquier reseña (RLS delete_own_or_mod). El email del autor se lee vía
     service-role y se trunca server-side (truncarEmail) para no exponerlo al
     cliente. usuario.email se añadió como columna denormalizada (M6) para el
     embed, y usuario_select_authenticated se restringió (M7) para no filtrar
     emails ajenos.
- D19: Listas personalizadas con modelo lista + lista_serie (UNIQUE
     lista_id+serie_id, posición para orden manual). RLS own_or_public vía
     subconsulta al padre lista (lista_serie no tiene user_id). Sin lista por
     defecto (crear explícitamente). Reordenar completo validado server-side
     (array con exactamente las series actuales). getLista/getListaPublica
     reciben AuthClient para que el RLS deje ver las privadas propias.
- D20: Recuperación de password con flujo GoTrue nativo (resetPasswordForEmail
      + verifyOtp con token_hash). Anti-enumeración a dos niveles: GoTrue
      (sin error en email inexistente) + action con mensaje genérico siempre.
      Mailpit como servidor de email local (puerto 54324). El dominio canónico
      es 127.0.0.1 (site_url de config.toml), no localhost, para que las cookies
      de sesión queden en el dominio correcto.
- D21: Edición de perfil con reauth de password (signInWithPassword
      antes de updateUser, porque secure_password_change=false en GoTrue).
      Cambio de email con confirmación de solo el email nuevo
      (double_confirm_changes=false para simplificar UX). display_name como
      columna TEXT NULL en usuario con CHECK 3-50 chars.