# 007 — Seed: series reales · Plan técnico

## Decisiones adoptadas (aprobadas)
1. **Idempotencia con UUIDs fijos** (SEED-02): todas las filas llevan UUIDs
   deterministas y created_at explícitos. ON CONFLICT DO NOTHING sobre las
   claves naturales: categoria(slug) · canal(handle) · serie(slug) ·
   episodio(serie_id, video_id) · participa PK (serie_id, canal_id) ·
   auth.users PK (id) · usuario PK (id) · valoracion(user_id, serie_id).
   Los UUIDs fijos hacen que las FKs se resuelvan aunque el insert del padre
   se haya saltado en una re-ejecución.
2. **Distribución de valoraciones** (decisión 4 de la spec): 24 series →
   6 top (media 8.5–9.5, 10–20 votos; empates intencionales a 9.5 y a 9.0
   dentro del top 5), 12 medias (6.0–8.0, 3–8 votos), 6 con 0–2 votos
   (→ "Sin valoraciones"). ~30 usuarios sintéticos reparten ~100
   valoraciones. Los created_at explícitos hacen determinista el desempate
   del top 5 por created_at desc (byRatingDesc, lib/series.ts:75).
3. **Portadas y avatares** (D5/D13): portada_url =
   https://img.youtube.com/vi/<video_id>/hqdefault.jpg derivada del primer
   episodio de cada serie. avatar_url de los canales a null → placeholder de
   la UI (los avatares reales de YouTube viven en yt3.googleusercontent.com,
   fuera de lo permitido por CONSTRAINTS y de remotePatterns de
   next.config.ts).
4. **Datos reales** (SEED-03): series y canales del ecosistema hispanohablante
   (propuesta de la spec; los títulos se ajustan a los reales durante T1).
   Cada video_id se verifica con el endpoint oEmbed de YouTube
   (https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json,
   sin API key ni cuota); los que no respondan 200 se sustituyen por IDs
   reales verificados en el momento.
5. **Mecanismo** (SEED-01): supabase/seed.sql, que supabase db reset ya
   ejecuta automáticamente ([db.seed] sql_paths=["./seed.sql"] en
   supabase/config.toml, ya configurado). Script npm run db:seed para
   re-sembrar sin reset (p.ej. tras el wipe que hace el E2E). Nota de
   ejecución (T1): `supabase db query --local -f` rechaza ficheros con
   múltiples statements ("cannot insert multiple commands into a prepared
   statement"); el script final usa psql del host con ON_ERROR_STOP=1 y la
   URL local estándar (credenciales de dev, como en tests/db/env.ts).

## Contexto del repo (hallazgos de planificación)
- **Esquema (M1–M4)**: categoria(nombre unique, slug unique) · canal(nombre,
  handle unique, avatar_url) · serie(titulo, slug unique, descripcion,
  portada_url, categoria_id FK NOT NULL, playlist_url, estado
  'activa'/'finalizada' default 'activa', anio_inicio, anio_fin,
  moderation_status default 'aprobada', created_at, updated_at; check
  anio_fin >= anio_inicio) · episodio(serie_id, temporada default 1, numero,
  titulo, video_id; UNIQUE(serie_id,temporada,numero) y
  UNIQUE(serie_id,video_id)) · participa PK(serie_id,canal_id), rol
  'principal'/'colaborador'/'invitado' default 'colaborador' ·
  usuario(id PK → auth.users) · valoracion(user_id → usuario, serie_id,
  nota 1–10, UNIQUE(user_id,serie_id)).
- **Cadena de FKs de valoracion**: valoracion.user_id → usuario.id →
  auth.users.id. El seed crea ~30 usuarios con insert directo en auth.users
  (UUIDs fijos, emails seed-NN@iswdb.local, columnas estándar: instance_id,
  aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token,
  recovery_token) + su fila en public.usuario. Sin tocar esquema.
- **CLI 2.115.0**: `supabase db query --local -f <file>` existe (verificado
  con --help); `supabase db reset` respeta [db.seed] y tiene --no-seed.
- **Paginación**: PAGE_SIZE=12 (lib/series.ts:4) → 24 series = 2 páginas.
- **Orden del catálogo**: listSeries ordena por created_at desc → fechas
  explícitas escaladas dan un orden estable y con sentido.
- **Tests (SEED-04)**: tests/db/* hacen wipe en beforeAll (catalog.test.ts
  borra participa/episodio/serie/canal/categoria; social.test.ts sus tablas);
  e2e/global-setup.ts limpia el catálogo y siembra su fixture e2e-*. El seed
  no interfiere. Tras validate.sh (e2e) el catálogo seed desaparece; se
  restaura con npm run db:seed sin necesidad de reset.
- **next.config.ts**: remotePatterns para img.youtube.com/i.ytimg.com ya
  existe ("Se usan a partir de F007").
- **moderation_status**: todas las series del seed 'aprobada' (catálogo
  público; la spec lo indica explícitamente).

## Datos del seed (propuesta de T1, se ajusta a reales durante la ejecución)
- **Categorías (5)**: Minecraft, GTA, Roleplay, Terror, Animación.
- **Canales (8–10)**: elrubius, vegetta777, thegrefg, ibai, auronplay,
  willex, komanche, nexxuz (+ hasta 2 más si alguna serie real lo requiere).
- **Series (24)** por categoría: Minecraft 6 (SquidCraft Games, TortillaLand,
  Karmaland, Hardcore de elrubius, UHC España…), GTA 5 (Marbella Vice,
  Infames RP, SpainRP…), Roleplay 4, Terror 5, Animación 4. Títulos
  definitivos: los reales verificados en T1.
- **Episodios**: 2–5 por serie, video_ids reales (verificación oEmbed).
- **Valoraciones**: distribución de la decisión 2; notas enteras 1–10 cuyas
  medias den los rangos pedidos (la UI redondea a 1 decimal).

## Orden de tareas (una sesión de Build por tarea)

### T1 — Seed SQL + script db:seed
- supabase/seed.sql (nuevo): 5 categorías · 8–10 canales · 24 series
  aprobadas (mezcla activa/finalizada, años coherentes con el check) ·
  2–5 episodios por serie · participa con roles · ~30 auth.users + usuario ·
  ~100 valoraciones. UUIDs fijos, created_at explícitos, ON CONFLICT DO
  NOTHING en todos los inserts.
- package.json: script db:seed = supabase db query --local -f supabase/seed.sql.
- Verificación: supabase db reset sin errores · npm run db:seed dos veces
  (idempotencia) · queries de conteo (series, categorías, canales, episodios,
  valoraciones).

### T2 — Reset + verificación visual (la hace el usuario)
- El agente ejecuta supabase db reset, confirma que termina sin errores y
  avisa al usuario. El usuario verifica en el navegador: home (hero + top 5
  + últimas), /series con 2+ páginas, fichas /series/<slug> y
  /canales/<handle> con datos reales, portadas válidas, "Sin valoraciones",
  empates del top 5 resueltos por created_at.
- Criterio: salida del reset limpia + evidencia visual del usuario.

### T3 — Cierre
- ROADMAP.md (007 ✅) · docs/memory/session-log.md (sesión F007) · tag F7 ·
  commit de cierre `F7: …`.
- Criterio: Definition of Done completa.

## Archivos
**Crear**
- spec/features/007-seed/{spec.md,plan.md,tasks.md}
- supabase/seed.sql

**Modificar**
- package.json (script db:seed)
- Al cierre: ROADMAP.md · docs/memory/session-log.md

## Riesgos técnicos
- **Insert directo en auth.users**: va a Postgres, GoTrue no lo valida en el
  momento; si alguna columna NOT NULL variase en la versión local, el error
  de T1 lo señala y se ajusta la lista de columnas. Los usuarios seed no
  necesitan login funcional (solo sostienen valoraciones).
- **video_ids de la propuesta**: si alguno no supera oEmbed, se sustituye por
  otro real del mismo canal/serie verificado en el momento.
- **E2E pisa el seed**: documentado en hallazgos; npm run db:seed restaura el
  catálogo sin reset.
- **ON CONFLICT en tablas sin clave natural nueva**: episodio usa
  UNIQUE(serie_id, video_id) y valoracion UNIQUE(user_id, serie_id); con
  UUIDs fijos no hay duplicados posibles en re-ejecuciones.

## Qué NO haré (fuera de alcance)
- Migraciones nuevas · tocar RLS, queries o lib/ · tests nuevos (los tests
  no dependen del seed) · dependencias nuevas · avatares reales de canales ·
  login (F008) · búsqueda (F006) · fórmula WR (F009).
