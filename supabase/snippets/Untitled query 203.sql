do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  c1 uuid; k1 uuid; s1 uuid;
begin
  insert into categoria (nombre, slug) values ('Prueba F004', 'prueba-f004') returning id into c1;
  insert into canal (nombre, handle) values ('Canal Prueba', '@canal-prueba') returning id into k1;

  insert into serie (titulo, slug, descripcion, categoria_id, estado, anio_inicio, anio_fin, moderation_status)
…  insert into usuario (id, rol) values (u1, 'user'), (u2, 'user');

  insert into valoracion (user_id, serie_id, nota) values (u1, s1, 9), (u2, s1, 10);
end $$;