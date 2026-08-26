## Vista general
Browser → Next.js (RSC + Server Actions) → Supabase (Postgres/Auth/Storage)
                                  Next.js → YouTube Data API v3 (server, con caché en BD)

## Modelo de dominio (relacional)
canal · categoria · serie (slug único, estado de moderación, playlist_url)
episodio (serie_id, temporada, numero, video_id, UNIQUE(serie,temporada,numero))
participa (serie_id ↔ canal_id N:M, con rol) · usuario · valoracion (UNIQUE(user,serie), nota 1–10)

## Seguridad (RLS)
- Catálogo (canal/categoria/serie/episodio): SELECT público; escritura solo rol admin/mod.
- valoracion: solo usuarios autenticados, una por usuario y serie (F009).

## Failure modes
- YouTube API caída / cuota agotada → metadatos cacheados en BD; degradar sin romper página.
- Episodio sin thumbnail → placeholder generado.
- Spam de aportes → cola de moderación (F011).
SYSTEM.md: NO procede todavía; se redactará para F011 (máquina de estados de moderación).