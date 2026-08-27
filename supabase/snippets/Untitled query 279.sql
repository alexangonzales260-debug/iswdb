do $$
declare c1 uuid; s1 uuid; s2 uuid;
begin
  insert into canal (nombre, handle, avatar_url)
  values ('Canal Prueba F005', '@canal-prueba-f005',
          'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  returning id into c1;

  insert into categoria (nombre, slug) values ('Cat F005', 'cat-f005');

  insert into serie (titulo, slug, descripcion, categoria_id, estado, anio_inicio, moderation_status)
  values ('Serie A F005', 'serie-a-f005', 'Serie A', (select id from categoria where slug='cat-f005'), 'activa', 2024, 'aprobada')
  returning id into s1;

  insert into serie (titulo, slug, descripcion, categoria_id, estado, anio_inicio, anio_fin, moderation_status)
  values ('Serie B F005', 'serie-b-f005', 'Serie B', (select id from categoria where slug='cat-f005'), 'finalizada', 2022, 2023, 'aprobada')
  returning id into s2;

  insert into participa (serie_id, canal_id, rol) values (s1, c1, 'principal');
  insert into participa (serie_id, canal_id, rol) values (s2, c1, 'colaborador');
end $$;