-- M2: tablas sociales (usuario, valoracion)

create table public.usuario (
  id uuid primary key references auth.users (id) on delete cascade,
  rol text not null default 'user' check (rol in ('user', 'mod', 'admin')),
  created_at timestamptz not null default now()
);

create table public.valoracion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuario (id) on delete cascade,
  serie_id uuid not null references public.serie (id) on delete cascade,
  nota int not null check (nota between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, serie_id)
);

create trigger valoracion_set_updated_at
  before update on public.valoracion
  for each row
  execute function public.set_updated_at();

-- valoracion: lectura pública (D11); escritura solo autenticados (RLS en M3).
grant select on table public.valoracion to anon, authenticated, service_role;
grant insert, update, delete on table public.valoracion to authenticated, service_role;

-- usuario: lectura solo autenticados; escritura propia protegida por el
-- trigger anti-escalada (M3).
grant select on table public.usuario to authenticated, service_role;
grant insert, update, delete on table public.usuario to authenticated, service_role;
