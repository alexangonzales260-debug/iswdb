-- M18: fix anon select on lista_colaborador (F024 T3)
-- Anon no debe tener acceso a lista_colaborador (información privada).
-- Grant select a anon + policy que siempre devuelve 0 filas (evita
-- "permission denied" en queries anon y devuelve [] consistente).

grant select on table public.lista_colaborador to anon;

create policy lista_colaborador_select_anon_none
  on public.lista_colaborador
  for select to anon
  using (false);