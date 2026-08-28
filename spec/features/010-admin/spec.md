# 010 — Admin: moderation dashboard

## Contexto
Feature L2. Da a usuarios mod/admin un dashboard para moderar series
(aprobar/rechazar pendientes) y gestionar el catálogo (CRUD de series con
canales y episodios). Usa roles existentes (usuario.rol) e is_admin_or_mod()
(D10). Requiere nuevas políticas RLS de escritura para mod/admin.

## Rutas
- `/admin`: dashboard (cola de pendientes + listado de todas + nueva serie).
- `/admin/series/nueva`: formulario de creación.
- `/admin/series/<slug>/editar`: formulario de edición.

## Requisitos (EARS)
- ADM-01: Cuando un usuario mod/admin accede a /admin, el sistema deberá
  mostrar la cola de series pendientes, el listado de todas las series con su
  estado, y acceso a crear una serie nueva.
- ADM-02: Cuando un mod/admin aprueba una serie pendiente, el sistema deberá
  cambiar moderation_status a 'aprobada' y la serie se volverá visible en el
  catálogo público.
- ADM-03: Cuando un mod/admin rechaza una serie pendiente, el sistema deberá
  cambiar moderation_status a 'rechazada' y la serie no será visible en el
  catálogo público.
- ADM-04: Cuando un usuario sin rol mod/admin (o anónimo) accede a /admin o
  sus subrutas, el sistema deberá devolver 404 (no revelar existencia del panel).
- ADM-05: Cuando un mod/admin crea una serie, el sistema deberá validar los
  campos (slug único, título requerido) y crear la serie con sus canales
  (participa) y episodios en una transacción.
- ADM-06: Cuando un mod/admin edita una serie, el sistema deberá permitir
  cambiar campos básicos y añadir/eliminar canales y episodios.
- ADM-07: El sistema aplicará nuevas políticas RLS de escritura para mod/admin
  (serie/episodio/participa/canal) usando is_admin_or_mod().
- ADM-08: Los formularios usarán Server Actions con validación server-side (Zod).

## Criterios de aceptación
- [ ] mod/admin ve /admin con pendientes + todas las series.
- [ ] user (no mod) y anónimo ven 404 en /admin y subrutas.
- [ ] Aprobar pendiente → 'aprobada' + visible en catálogo público.
- [ ] Rechazar pendiente → 'rechazada' + no visible.
- [ ] Crear serie con canales y episodios → inserts correctos (transacción).
- [ ] Editar serie (campos + canales + episodios) → updates correctos.
- [ ] RLS: user/anon no pueden insert/update serie (políticas niegan).
- [ ] Tests de servidor: moderación, CRUD, RLS mod vs user/anon.
- [ ] Test E2E: mod login → /admin → aprobar → visible en catálogo.
- [ ] ./validate.sh en verde.

## Fuera de alcance
- Gestión de roles (promover a mod/admin) — vía SQL
- Moderación de reseñas (F012)
- Curación manual de hero (F011)
- Borrado físico de series (solo cambio de estado)
