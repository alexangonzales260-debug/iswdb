-- M1: tablas de catálogo (categoria, canal, serie, episodio, participa)

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.categoria (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table public.canal (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  handle text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.serie (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  descripcion text,
  portada_url text,
  categoria_id uuid not null references public.categoria (id),
  playlist_url text,
  estado text not null default 'activa' check (estado in ('activa', 'finalizada')),
  anio_inicio smallint,
  anio_fin smallint,
  moderation_status text not null default 'aprobada'
    check (moderation_status in ('borrador', 'pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (anio_inicio is null or anio_fin is null or anio_fin >= anio_inicio)
);

create trigger serie_set_updated_at
  before update on public.serie
  for each row
  execute function public.set_updated_at();

create table public.episodio (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null references public.serie (id) on delete cascade,
  temporada int not null default 1,
  numero int not null,
  titulo text not null,
  video_id text not null,
  created_at timestamptz not null default now(),
  unique (serie_id, temporada, numero),
  unique (serie_id, video_id)
);

create index episodio_video_id_idx on public.episodio (video_id);

create table public.participa (
  serie_id uuid not null references public.serie (id) on delete cascade,
  canal_id uuid not null references public.canal (id) on delete cascade,
  rol text not null default 'colaborador'
    check (rol in ('principal', 'colaborador', 'invitado')),
  created_at timestamptz not null default now(),
  primary key (serie_id, canal_id)
);

-- El esquema base de Supabase ya no concede SELECT por defecto en public.
-- Lectura pública del catálogo (MOD-05); la escritura queda en authenticated
-- y la restringe RLS (M3) a admin/mod.
grant select on table public.categoria to anon, authenticated, service_role;
grant select on table public.canal to anon, authenticated, service_role;
grant select on table public.serie to anon, authenticated, service_role;
grant select on table public.episodio to anon, authenticated, service_role;
grant select on table public.participa to anon, authenticated, service_role;

grant insert, update, delete on table public.categoria to authenticated, service_role;
grant insert, update, delete on table public.canal to authenticated, service_role;
grant insert, update, delete on table public.serie to authenticated, service_role;
grant insert, update, delete on table public.episodio to authenticated, service_role;
grant insert, update, delete on table public.participa to authenticated, service_role;
