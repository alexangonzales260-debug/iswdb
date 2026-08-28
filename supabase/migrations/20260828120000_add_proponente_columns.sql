-- M8: propuestas de series (F011)

-- La serie no tenía user_id: se añade nullable (propuestas anónimas = NULL;
-- el contacto se guarda en proponente_email). On delete set null: si se
-- elimina el usuario proponente (follow-up historial), la serie no se borra.
alter table public.serie
  add column proponente_email text,
  add column user_id uuid references public.usuario (id) on delete set null;

-- Lectura: anon SOLO ve series aprobadas (PRO-06, evita enumerar propuestas
-- pendientes ajenas). authenticated conserva la lectura completa `using(true)`:
-- VAL-07 (lib/valoraciones.ts) y RES-01 (lib/reseñas.ts) leen pendientes con
-- el cliente autenticado para devolver mensajes amigables (serieNoAprobada),
-- y los tests de valoraciones/reseñas lo verifican. El panel /admin se
-- protege con requireMod en la UI (decisión 1 de F010), no por RLS.
drop policy serie_select_public on public.serie;

create policy serie_select_public on public.serie
  for select to anon
  using (moderation_status = 'aprobada');

create policy serie_select_authenticated on public.serie
  for select to authenticated
  using (true);

-- Escritura de propuestas: NO hay políticas de insert para anon en serie/
-- participa (anon conserva solo el SELECT de M1). Las propuestas entran
-- EXCLUSIVAMENTE por la función crear_propuesta (PRO-01/PRO-04):
--  - Hallazgo de PostgreSQL: con RLS activo, una fila NUEVA añadida por
--    INSERT debe ser también LEGIBLE por las policies SELECT del rol (el
--    check de INSERT incluye la visibilidad). Como anon no puede leer
--    pendientes (policy de arriba), un policy `serie_insert_propuesta`
--    (pendiente + user_id null) es INVIABLE: rechazaría su propio insert.
--    Verificado empíricamente en el stack local (28-ago-2026).
--  - La alternativa supabase-standard es una función SECURITY DEFINER que
--    inserta en una transacción, con moderation_status='pendiente' y
--    user_id=NULL forzados en SQL (sin parámetro para ellos: PRO-04).
--    Anon solo tiene EXECUTE, no puede insertar filas a mano (defensa
--    extra contra spam de pendients por API directa).
create or replace function public.crear_propuesta(
  p_titulo text,
  p_descripcion text,
  p_categoria_id uuid,
  p_playlist_url text,
  p_proponente_email text,
  p_slug text,
  p_canales jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serie_id uuid;
  v_canal jsonb;
begin
  -- PRO-04: el status se fuerza aquí; no hay parámetro para él. user_id null:
  -- la propuesta anónima no tiene propietario (el contacto es proponente_email).
  insert into public.serie (
    titulo, slug, descripcion, categoria_id, playlist_url,
    proponente_email, moderation_status, user_id
  )
  values (
    p_titulo, p_slug, p_descripcion, p_categoria_id, p_playlist_url,
    p_proponente_email, 'pendiente', null
  )
  returning id into v_serie_id;

  -- Canales: solo los ya existentes en el catálogo (la FK canal_id garantiza
  -- el rechazo; el servicio lib resuelve handle→id ANTES con mensaje amigable).
  -- La FK serie_id (cascade) liga el participa a la propuesta recién creada.
  for v_canal in select * from jsonb_array_elements(coalesce(p_canales, '[]'::jsonb))
  loop
    insert into public.participa (serie_id, canal_id, rol)
    values (v_serie_id, (v_canal->>'canal_id')::uuid, coalesce(v_canal->>'rol', 'colaborador'));
  end loop;
end;
$$;

revoke execute on function public.crear_propuesta(text, text, uuid, text, text, text, jsonb) from public;
grant execute on function public.crear_propuesta(text, text, uuid, text, text, text, jsonb) to anon, authenticated;