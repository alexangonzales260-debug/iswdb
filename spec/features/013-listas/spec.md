# 013 — Listas personalizadas

## Contexto
Feature L2. Permite a usuarios autenticados crear listas personalizadas de
series (públicas o privadas), añadir/quitar series y reordenarlas manualmente.
Requiere migración M9 para las tablas lista y lista_serie + políticas RLS.

## Rutas
- `/listas`: grid de mis listas (protegida, requiere sesión).
- `/listas/<id>`: detalle de una lista (pública visible para todos, privada solo owner).

## Requisitos (EARS)
- LIS-01: Cuando un usuario autenticado crea una lista, el sistema deberá
  validar el nombre (requerido, 3-100 chars) y crearla con es_publica=false por defecto.
- LIS-02: Cuando un usuario autenticado renombra su lista, el sistema deberá
  actualizar el nombre.
- LIS-03: Cuando un usuario autenticado elimina su lista, el sistema deberá
  borrarla (cascade borra lista_serie).
- LIS-04: Cuando un usuario autenticado añade una serie a su lista, el sistema
  deberá validar que la serie existe y está aprobada, y crear lista_serie con
  la siguiente posición disponible.
- LIS-05: Cuando un usuario autenticado quita una serie de su lista, el sistema
  deberá borrar lista_serie.
- LIS-06: Cuando un usuario autenticado reordena su lista, el sistema deberá
  actualizar las posiciones de lista_serie.
- LIS-07: Cuando un visitante (anon o autenticado) accede a una lista pública,
  el sistema deberá mostrarla en modo solo lectura.
- LIS-08: Cuando un usuario autenticado accede a una lista privada ajena, el
  sistema deberá devolver 404 (notFound).
- LIS-09: Cuando un visitante sin sesión accede a /listas, el sistema deberá
  redirigir a /login con callback (AUTH-06).
- LIS-10: La ficha de serie tendrá un botón "Añadir a lista" (dropdown con
  mis listas) visible solo si hay sesión.

## Criterios de aceptación
- [ ] Usuario crea lista → visible en /listas.
- [ ] Usuario renombra lista → nombre actualizado.
- [ ] Usuario elimina lista → desaparece de /listas.
- [ ] Usuario añade serie a lista → visible en /listas/<id>.
- [ ] Usuario quita serie de lista → desaparece del detalle.
- [ ] Usuario reordena lista → posiciones actualizadas.
- [ ] Lista pública visible para anon (solo lectura).
- [ ] Lista privada ajena → 404.
- [ ] Sin sesión en /listas → redirect a /login.
- [ ] Botón "Añadir a lista" en ficha visible solo con sesión.
- [ ] Tests de servidor: CRUD, RLS, validaciones.
- [ ] Test E2E Playwright: flujo completo (crear → añadir → reordenar → pública visible).
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Listas colaborativas (multi-usuario)
- Compartir listas por enlace privado
- Duplicar listas
- Exportar/importar listas
- Likes/comentarios en listas públicas
- Ranking de listas populares
