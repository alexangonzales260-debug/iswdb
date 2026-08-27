# 007 — Seed: series reales · Tareas

- [x] T1 — Seed SQL + script db:seed
  supabase/seed.sql (nuevo): 5 categorías (Minecraft, GTA, Roleplay, Terror,
  Animación) · 10 canales reales (@elrubius, @vegetta777, @thegrefg, @ibai,
  @auronplay, @willyrex, @komanche, @nexxuz, @huevocartoon, @31minutos) ·
  24 series aprobadas con 2–5 episodios (81 video_ids reales verificados por
  oEmbed, 81/81 OK) · participa con roles (38 filas) · 30 auth.users +
  public.usuario · 142 valoraciones: 6 series top (8.5–9.5, 10–20 votos,
  empates intencionales a 9.5 y 9.0 en el top 5), 12 medias (6.0–8.0, 3–8
  votos), 6 con 0–2 votos ("Sin valoraciones"). UUIDs fijos, created_at
  explícitos, portadas hqdefault.jpg del primer episodio, avatar_url null,
  ON CONFLICT DO NOTHING en todos los inserts.
  package.json: script db:seed = psql <url-local> -v ON_ERROR_STOP=1 -f
  supabase/seed.sql. Nota: se usa psql en vez de `supabase db query -f`
  porque el CLI rechaza múltiples statements ("cannot insert multiple
  commands into a prepared statement"); psql del host está disponible.
  Criterio: supabase db reset sin errores · npm run db:seed x2 (idempotente) ·
  conteos correctos vía query.

- [x] T2 — Reset + verificación visual del usuario
  El agente ejecuta supabase db reset, confirma que termina sin errores y
  avisa al usuario. La verificación visual la hace el usuario (como en
  F003/F004/F005): home (hero + top 5 + últimas), /series con 2+ páginas,
  fichas /series/<slug> y /canales/<handle> con datos reales, portadas
  válidas, "Sin valoraciones", empates del top 5 resueltos por created_at.
  Criterio: salida del reset limpia + evidencia visual del usuario.
  Nota: verificación visual realizada por el usuario y aprobada.

- [x] T3 — Cierre
  ROADMAP.md (007 ✅) · docs/memory/session-log.md (sesión F007) · tag F7 ·
  commit de cierre `F7: …`.
  Criterio: Definition of Done completa.
