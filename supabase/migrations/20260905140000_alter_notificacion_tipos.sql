-- M16: F023 — notificacion soporta tipo 'nuevo_seguidor'
-- serie_id y episodio_id dejan de ser obligatorios (una notificación
-- 'nuevo_seguidor' no referencia serie ni episodio). Se añaden tipo
-- (discriminador) y seguidor_id (FK a usuario, cascade).

alter table public.notificacion
  alter column episodio_id drop not null,
  alter column serie_id    drop not null,
  add column seguidor_id uuid references public.usuario (id) on delete cascade,
  add column tipo text not null default 'nuevo_episodio';

alter table public.notificacion
  add constraint notificacion_tipo_check check (tipo in ('nuevo_episodio', 'nuevo_seguidor'));

-- Consistencia por tipo: nuevo_episodio obliga a serie/episodio y prohíbe
-- seguidor; nuevo_seguidor obliga a seguidor y prohíbe serie/episodio.
alter table public.notificacion
  add constraint notificacion_columnas_por_tipo_check check (
    (tipo = 'nuevo_episodio' and serie_id is not null and episodio_id is not null and seguidor_id is null)
    or
    (tipo = 'nuevo_seguidor' and seguidor_id is not null and serie_id is null and episodio_id is null)
  );

-- Idempotencia NOT-07 SOLO para nuevo_episodio (no para nuevo_seguidor, NOT-11:
-- cada follow genera una notificación nueva). Se mantiene la UNIQUE global
-- (usuario_id, episodio_id) de M12: con episodio_id NOT NULL en nuevo_episodio
-- el par duplicado se rechaza (NOT-07), y para nuevo_seguidor episodio_id es
-- siempre NULL, y NULLs no colisionan en un índice UNIQUE de btree → cada
-- follow genera una fila nueva (NOT-11). El CHECK de consistencia garantiza que
-- nuevo_episodio siempre lleva episodio_id y nuevo_seguidor nunca.

-- Backfill: filas existentes son todas de nuevos episodios.
update public.notificacion set tipo = 'nuevo_episodio', seguidor_id = null;

-- Índice para listar/filtrar notificaciones por usuario y tipo.
create index notificacion_tipo_idx on public.notificacion (usuario_id, tipo);