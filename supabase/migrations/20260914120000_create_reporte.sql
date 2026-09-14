-- M22: tabla reporte (F028) + RLS
-- Reportes de contenido: usuarios autenticados señalan contenido
-- inapropiado (serie, episodio, reseña o comentario). FK al contenido
-- on delete cascade (si el contenido desaparece, su reporte desaparece);
-- FK al reportador on delete cascade. Discriminador tipo + FK parcial con
-- CHECK de consistencia (patrón M16 notificacion). Sin updated_at: el
-- estado cambia con update y no hay necesidad de refresco. Flag 5
-- APROBADO: update/delete del reporte SOLO para mods/admins (is_admin_or_mod);
-- el reportador NO puede modificar ni borrar su propio reporte (inmutable
-- para quien lo emite, la cola la gestiona el rol mod). Sin anon: insert
-- solo authenticated, select solo own_or_mod.

create table public."reporte" (
  id uuid primary key default gen_random_uuid(),
  reportador_id uuid not null references public.usuario (id) on delete cascade,
  tipo text not null check (tipo in ('serie', 'episodio', 'reseña', 'comentario')),
  serie_id uuid references public.serie (id) on delete cascade,
  episodio_id uuid references public.episodio (id) on delete cascade,
  "reseña_id" uuid references public."reseña" (id) on delete cascade,
  comentario_id uuid references public.comentario (id) on delete cascade,
  motivo text not null check (char_length(motivo) between 1 and 2000),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'revisado', 'descartado')),
  created_at timestamptz not null default now(),
  -- Consistencia del discriminador: exactamente una FK según tipo.
  check (
    (tipo = 'serie' and serie_id is not null and episodio_id is null
       and "reseña_id" is null and comentario_id is null)
    or (tipo = 'episodio' and serie_id is null and episodio_id is not null
       and "reseña_id" is null and comentario_id is null)
    or (tipo = 'reseña' and serie_id is null and episodio_id is null
       and "reseña_id" is not null and comentario_id is null)
    or (tipo = 'comentario' and serie_id is null and episodio_id is null
       and "reseña_id" is null and comentario_id is not null)
  )
);

-- Reportes de un reportador (lista propia, REP-03) y cola de /admin por estado.
create index reporte_reportador_idx on public."reporte" (reportador_id, created_at desc);
create index reporte_mod_estado_idx on public."reporte" (estado, created_at desc);

alter table public."reporte" enable row level security;

-- REP-02: sin anon. Insert del reportador (REPORT-01). Select own o mod
-- (REPORT-03/04). Update y delete SOLO mod/admin (flag 5, REPORT-04/05/06):
-- el reportador own no tiene políticas de update/delete, así que CUALQUIER
-- update/delete de un no-mod afecta 0 filas (incluida la suya).
create policy "reporte_insert_own" on public."reporte"
  for insert to authenticated with check (reportador_id = auth.uid());
create policy "reporte_select_own_or_mod" on public."reporte"
  for select to authenticated
  using (reportador_id = auth.uid() or public.is_admin_or_mod());
create policy "reporte_update_mod" on public."reporte"
  for update to authenticated
  using (public.is_admin_or_mod()) with check (public.is_admin_or_mod());
create policy "reporte_delete_mod" on public."reporte"
  for delete to authenticated using (public.is_admin_or_mod());

-- Grants patrón M2: solo authenticated + service_role; anon queda fuera
-- del select (no ve la tabla, REPORT-02).
grant select, insert, update, delete on table public."reporte" to authenticated, service_role;