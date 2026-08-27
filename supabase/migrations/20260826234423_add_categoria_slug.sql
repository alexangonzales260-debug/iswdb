-- M4: slug en categoria (CAT-02, spec 003)

alter table public.categoria add column slug text;

-- Backfill placeholder: la BD está vacía hasta F007; si hubiera datos, se
-- genera un slug básico desde el nombre (el slug definitivo será manual o
-- con slugify robusto).
update public.categoria set slug = lower(replace(nombre, ' ', '-'));

alter table public.categoria alter column slug set not null;

create unique index categoria_slug_key on public.categoria (slug);
