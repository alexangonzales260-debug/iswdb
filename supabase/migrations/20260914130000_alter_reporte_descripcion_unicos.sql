-- M23: F028 — reporte soporta descripcion + UNIQUE de duplicado (REP-03)
-- La tabla reporte (M22) guardaba solo el motivo. Este feature añade la
-- descripcion opcional del reportador (validada en app con max 500) y
-- garantiza en BD que un usuario no pueda reportar dos veces el mismo
-- contenido: UNIQUE (reportador_id, reseña_id) y (reportador_id,
-- comentario_id). Los NULL (filas de tipo serie/episodio) no colisionan en
-- un índice UNIQUE, así que los tipos serie/episodio quedan sin límite por
-- reportador (se cubrirán cuando exista su servicio de reporte).

alter table public."reporte"
  add column descripcion text check (descripcion is null or char_length(descripcion) <= 500);

create unique index reporte_reportador_reseña_uniq
  on public."reporte" (reportador_id, "reseña_id");
create unique index reporte_reportador_comentario_uniq
  on public."reporte" (reportador_id, comentario_id);