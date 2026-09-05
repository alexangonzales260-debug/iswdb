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
      [F017-fix] El dominio canónico pasa a ser **http://localhost:3000** (site_url
      de config.toml, NEXT_PUBLIC_SITE_URL, browser client, baseURL de Playwright
      y Authorized JavaScript origin de Google). Razón: al usar @supabase/ssr, el
      code_verifier/sesión del OAuth se guarda en cookies del mismo host del
      browser; unificar todo en localhost evita el mismatch de host que rompía el
      intercambio PKCE ("code verifier not found in storage"). El API de Auth de
      Supabase (127.0.0.1:54321) queda al margen: el code_verifier vive en cookies
      del browser, no en GoTrue.
- D21: Edición de perfil con reauth de password (signInWithPassword
      antes de updateUser, porque secure_password_change=false en GoTrue).
      Cambio de email con confirmación de solo el email nuevo
      (double_confirm_changes=false para simplificar UX). display_name como
      columna TEXT NULL en usuario con CHECK 3-50 chars.
- D22: Dashboard de actividad con tabs CSS puro (:target) en lugar de
      componente cliente, priorizando simplicidad. Propuestas anónimas
      (user_id NULL) no se muestran en el dashboard; solo las del usuario
      logueado. Agregados calculados en servidor (D16) sin caché.
      listMisPropuestas usa cliente con sesión para ver propuestas
      pendientes/rechazadas propias (RLS serie_select_authenticated).
- D23: OAuth Google vía Supabase Auth sin implementación manual
      (flujo PKCE, callback e intercambio gestionados por GoTrue y browser
      client). Browser client factory en lib/supabase-browser.ts + listener
      en app/layout.tsx con onAuthStateChange → router.refresh(). Botón
      type='button' en login/registro con signInWithOAuth directo (sin
      servicios server-only en cliente). Merge de cuentas automático por
      GoTrue (mismo email → mismo auth.users.id). skip_nonce_check=true
      requerido para Google en local.
- D24: Seguimiento de series con tabla usuario_serie (usuario_id, serie_id,
      UNIQUE, FK cascade, RLS own con auth.uid() directo). Revalidación acotada
      (/series/<slug> + /perfil/seguidas). Idempotencia en seguir/dejar
      (23505 silenciado). Self-healing de public.usuario centralizado en
      asegurarFilaUsuario y aplicado en escrituras con FK a usuario, no solo
      en /perfil.
- D25: Notificaciones generadas en la acción de admin (no trigger en BD)
      para mantener el flujo explícito y testeable. Insert solo service_role
      (RLS) con notificarNuevoEpisodio inyectable. Fallo de notificación se
      logea y no revierte el episodio (aceptado). Badge como Server Component
      que hereda dynamic del header. UNIQUE(usuario_id, episodio_id) para
      idempotencia. UUIDs del seed (no-v4) validados con regex general en
      lugar de z.uuid() de Zod v4.
- D26: Recomendaciones con collaborative filtering simple + content-based
      (sin ML ni librerías). Cálculo en servidor sin caché (catálogo pequeño).
      Conteo de seguidores con createServiceRoleClient() porque el RLS de
      usuario_serie es solo-propio. Exclusión de todas las valoradas (no solo
      ≥7) para no recomendar lo ya consumido. Razón determinista: orden
      canónico de fuentes (follows asc → valoradas ≥7 asc) + mapa
      categoria_id→primera fuente.
- D27: Username único con backfill determinista (base sanitizada del email
     truncada a 13 + sufijo de 6 del id; regla idéntica en SQL y TS). Perfil
     público /usuarios/<username> sin sesión, lectura cross-user vía
     createServiceRoleClient() server-side (M7/M11 intactos, sin política
     pública nueva ni view). Todo público por defecto (sin flags de
     privacidad). notFound() para username inexistente.
