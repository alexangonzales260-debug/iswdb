# Tareas — 019 Notificaciones

Cada tarea = una sesión de Build. Orden estricto.

---

## T1: Migración M12 — tabla notificacion
**Crear**: `supabase/migrations/20260904100000_create_notificacion.sql`
**Contenido**: tabla notificacion, UNIQUE, índices, grants, RLS (ver plan.md §1)
**Verificar**: `supabase db reset` + inspección de tabla
**Depende de**: nada

---

## T2: Servicios — lib/notificaciones.ts
**Crear**: `lib/notificaciones.ts`
**Contenido**: listMisNotificaciones, marcarLeida, marcarTodasLeidas, contarNoLeidas, notificarNuevoEpisodio (usa createServiceRoleClient)
**Verificar**: `npm run typecheck`
**Depende de**: T1

---

## T3: Tests de servidor — notificaciones
**Crear**: `tests/notificaciones.test.ts` (o similar)
**Contenido**: generación al crear episodio, listar, marcar, marcar todas, RLS, UNIQUE
**Verificar**: `npm run test`
**Depende de**: T2

---

## T4: Integración admin — crearSerie + editarSerie
**Modificar**: `lib/admin.ts`
**Contenido**: tras insertar episodios, llamar notificarNuevoEpisodio con createServiceRoleClient() para cada episodio nuevo
**Verificar**: `npm run typecheck` + tests de T3 pasan
**Depende de**: T2, T3

---

## T5: Badge + header
**Crear**: `components/notificacion-badge.tsx`
**Modificar**: `components/header.tsx`
**Contenido**: badge async RSC con contador de no leídas, visible solo con sesión
**Verificar**: `npm run typecheck`
**Depende de**: T2

---

## T6: UI notificaciones — página + actions + botones
**Crear**:
  - `lib/notificaciones-actions.ts` (server actions: marcarLeida, marcarTodasLeidas)
  - `components/marcar-leida-button.tsx` (client component con useTransition)
  - `app/perfil/notificaciones/page.tsx` (RSC force-dynamic, lista, botones)
**Verificar**: `npm run typecheck`
**Depende de**: T2, T5

---

## T7: Test E2E — flujo completo
**Crear/Modificar**: archivo de test Playwright existente o nuevo
**Contenido**: seguir serie → admin crea episodio → badge → notificaciones → marcar leída
**Verificar**: `npm run test` (Playwright)
**Depende de**: T1–T6

---

## T8: Validación final + cierre
**Ejecutar**: `./validate.sh`
**Verificar**: 0 errores en lint, typecheck, tests, build
**Actualizar**: ROADMAP.md, DECISIONS.md (D25 sobre notificaciones)
**Depende de**: todas las anteriores
