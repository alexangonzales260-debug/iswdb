# 024 — Listas colaborativas

## Contexto
Feature L2. Complemento de F013: múltiples usuarios pueden editar una lista.
Tabla lista_colaborador (M17) con roles granulares (dueño/editor/lector).
Invitación por username desde /listas/<id>. Sin notificaciones de invitación,
sin solicitudes de colaboración, sin transferencia de propiedad.

## Rutas
- `/listas/<id>`: sección "Colaboradores" + permisos por rol (protegida si
  privada; pública visible para todos).

## Requisitos (EARS)
- COL-01: Cuando el dueño de una lista invita a un usuario por username, el
  sistema deberá crear una fila en lista_colaborador con el rol especificado.
- COL-02: Un colaborador con rol 'editor' podrá añadir/quitar series de la
  lista, renombrarla y cambiar su descripción.
- COL-03: Un colaborador con rol 'lector' podrá ver la lista aunque sea
  privada.
- COL-04: El dueño podrá quitar colaboradores y cambiar sus roles.
- COL-05: Solo el dueño podrá invitar colaboradores.
- COL-06: Un usuario no podrá ser colaborador de la misma lista dos veces
  (UNIQUE).
- COL-07: Un ajeno sin invitación no podrá ver una lista privada.
- COL-08: Cuando una lista tiene más de 1 editor, el sistema deberá mostrar
  un indicador "lista colaborativa".

## Criterios de aceptación
- [ ] Dueño invita colaborador por username con rol.
- [ ] Editor puede añadir/quitar series, renombrar, cambiar descripción.
- [ ] Lector puede ver lista privada.
- [ ] Dueño quita colaboradores y cambia roles.
- [ ] Solo dueño invita.
- [ ] UNIQUE(lista_id, usuario_id).
- [ ] Ajeno sin invitación no ve lista privada.
- [ ] Indicador "lista colaborativa" si > 1 editor.
- [ ] Tests de servidor: invitación, permisos por rol, RLS, UNIQUE.
- [ ] Test E2E: invitar → editar → quitar.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Notificaciones de invitación
- Solicitudes de colaboración
- Transferencia de propiedad
- Chat entre colaboradores
- Historial de cambios por colaborador
- Permisos por serie individual (solo por lista)