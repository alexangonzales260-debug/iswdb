-- M20: F026 — notificacion soporta tipo 'nuevo_comentario'
-- comentario_id referencia el comentario que dispara la notificación
-- (FK cascade: borrar comentario/reseña/usuario borra la notificación).
-- Sin UNIQUE: cada comentario genera una notificación (NOTC-04).

alter table public.notificacion
  add column comentario_id uuid references public.comentario (id) on delete cascade;

-- Backfill: las filas existentes (nuevo_episodio / nuevo_seguidor) no
-- referencian ningún comentario.
update public.notificacion set comentario_id = null;

-- Tipo: se extiende el CHECK de M16 con el tercer valor.
alter table public.notificacion
  drop constraint notificacion_tipo_check,
  add constraint notificacion_tipo_check check (tipo in ('nuevo_episodio', 'nuevo_seguidor', 'nuevo_comentario'));

-- Consistencia por tipo (3 vías). Las filas existentes ya cumplen los
-- primeros dos ramos y el backfill deja comentario_id NULL.
alter table public.notificacion
  drop constraint notificacion_columnas_por_tipo_check,
  add constraint notificacion_columnas_por_tipo_check check (
    (tipo = 'nuevo_episodio'    and serie_id is not null and episodio_id is not null and seguidor_id is null and comentario_id is null)
    or
    (tipo = 'nuevo_seguidor'    and seguidor_id is not null and serie_id is null and episodio_id is null and comentario_id is null)
    or
    (tipo = 'nuevo_comentario'  and comentario_id is not null and serie_id is null and episodio_id is null and seguidor_id is null)
  );

-- Sin UNIQUE adicional para nuevo_comentario: la UNIQUE global
-- (usuario_id, episodio_id) de M12 se mantiene y no interfiere porque
-- nuevo_comentario lleva episodio_id siempre NULL (los NULL no colisionan en
-- un índice btree).