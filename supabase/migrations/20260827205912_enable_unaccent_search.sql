-- F006: búsqueda insensible a acentos y mayúsculas (BUS-01, BUS-03, BUS-07)
--
-- El builder de supabase-js no puede invocar funciones dentro de los filtros,
-- así que el predicado ILIKE + unaccent vive en estas funciones RPC.
-- SECURITY INVOKER (por omisión): las queries internas se ejecutan con las
-- políticas RLS del rol invocador (lectura pública de serie/canal/participa).

create extension if not exists unaccent with schema extensions;

-- buscar_series(q): series aprobadas cuyo título coincide con q, o en las que
-- participa algún canal cuyo nombre o handle coincide. Coincidencia:
-- substring ILIKE sobre la versión sin acentos de columna y término. Los
-- comodines de ILIKE presentes en el término (\, %, _) se escapan en ese
-- orden para que se interpreten como literales.
create or replace function public.buscar_series(q text)
returns setof public.serie
language sql
stable
set search_path = public, extensions
as $$
  with termino as (
    select '%' || replace(replace(replace(extensions.unaccent(btrim(q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
  )
  select s.*
  from public.serie s
  cross join termino t
  where s.moderation_status = 'aprobada'
    and (
      extensions.unaccent(s.titulo) ilike t.patron
      or exists (
        select 1
        from public.participa p
        join public.canal c on c.id = p.canal_id
        where p.serie_id = s.id
          and (extensions.unaccent(c.nombre) ilike t.patron
            or extensions.unaccent(c.handle) ilike t.patron)
      )
    );
$$;

-- buscar_canales(q): canales que participan en ≥1 serie aprobada (coherente
-- con la ficha de canal, F005) y cuyo nombre o handle coincide con q.
-- Orden: nombre asc.
create or replace function public.buscar_canales(q text)
returns setof public.canal
language sql
stable
set search_path = public, extensions
as $$
  with termino as (
    select '%' || replace(replace(replace(extensions.unaccent(btrim(q)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
  )
  select c.*
  from public.canal c
  cross join termino t
  where exists (
    select 1
    from public.participa p
    join public.serie s on s.id = p.serie_id
    where p.canal_id = c.id
      and s.moderation_status = 'aprobada'
  )
  and (extensions.unaccent(c.nombre) ilike t.patron
    or extensions.unaccent(c.handle) ilike t.patron)
  order by c.nombre;
$$;
