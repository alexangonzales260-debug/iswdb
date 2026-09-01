# Tasks — Feature 016: Dashboard "Mi actividad"

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: lib/actividad.ts — Servicios del dashboard
**Objetivo**: Crear servicios inyectables para leer actividad y calcular agregados.

**Entregables**:
- `lib/actividad.ts` con:
  - `listMisValoraciones(client, userId)` — join serie (titulo, slug, portada_url, categoria.nombre), order created_at desc
  - `listMisReseñas(client, userId)` — join serie (titulo, slug), order created_at desc
  - `listMisPropuestas(client, userId)` — serie where user_id = userId, incluye moderation_status, slug solo si aprobada
  - `calcularAgregados(valoraciones, reseñas, listas, propuestas)` — función pura
- Tipos TypeScript exportados para los retornos

**Tests**: `tests/lib/actividad.test.ts`
- Fixture: usuario con 2 valoraciones, 2 reseñas, 2 listas, 3 propuestas (pendiente/aprobada/rechazada)
- Verificar orden desc, joins correctos, filtro user_id en propuestas
- `calcularAgregados`: conteos exactos, promedio 1 decimal, null si 0 valoraciones

**Validación**: `npm run test tests/lib/actividad.test.ts`

---

## T2: components/actividad-dashboard.tsx — Dashboard (Server Component)
**Objetivo**: Componente que renderiza agregados + 4 secciones con listados.

**Entregables**:
- `components/actividad-dashboard.tsx` (Server Component)
- Recibe props: `agregados`, `valoraciones`, `reseñas`, `listas`, `propuestas`
- Sección **Agregados**: 5 cards (Total valoraciones, Promedio dado, Total reseñas, Total listas, Total propuestas)
- **Tabs/Secciones**: 4 paneles (usar anchors CSS `:target` o tabs simples)
  - Valoraciones: Link a `/series/<slug>`, nota, fecha, portada thumbnail
  - Reseñas: Link a `/series/<slug>`, extracto ~150 chars, fecha
  - Listas: Link a `/listas/<id>`, nombre, nº series, badge pública/privada
  - Propuestas: Título, badge estado, link a ficha si aprobada / "Rechazada" texto si rechazada
- `EmptyState` por sección si no hay datos

**Validación**: `npm run lint && npm run typecheck`

---

## T3: components/actividad-tab.tsx — Tab interactivo (Client Component, opcional)
**Objetivo**: Si tabs CSS puro no es suficiente, componente cliente mínimo.

**Entregables**:
- `components/actividad-tab.tsx` con `"use client"`
- `useState` para tab activo, botones + paneles
- Accesibilidad: `role="tablist"`, `aria-selected`, `aria-controls`

**Nota**: Solo si T2 lo requiere. Preferir CSS anchors.

**Validación**: `npm run lint && npm run typecheck`

---

## T4: app/perfil/actividad/page.tsx — Página RSC protegida
**Objetivo**: Página que orquesta la lectura y renderiza el dashboard.

**Entregables**:
- `app/perfil/actividad/page.tsx`
- `export const dynamic = "force-dynamic"`
- `requireUser({ next: "/perfil/actividad" })` → `getUser()` → `createAuthClient()`
- `Promise.all` con: `listMisValoraciones`, `listMisReseñas`, `listMisListas` (lib/listas.ts), `listMisPropuestas`
- `calcularAgregados` → `<ActividadDashboard ... />`

**Validación**: `npm run lint && npm run typecheck`

---

## T5: app/perfil/page.tsx — Link "Ver mi actividad"
**Objetivo**: Añadir enlace en la página de perfil existente.

**Entregables**:
- Modificar `app/perfil/page.tsx`
- Añadir en sección "Datos de la cuenta" o al final:
  ```tsx
  <Link href="/perfil/actividad" className="text-brand underline-offset-2 hover:underline">
    Ver mi actividad
  </Link>
  ```

**Validación**: `npm run lint && npm run typecheck`

---

## T6: tests/lib/actividad.test.ts — Tests de servidor
**Objetivo**: Cubrir servicios de `lib/actividad.ts` con fixtures reales.

**Entregables**:
- `tests/lib/actividad.test.ts`
- Setup: `vi.hoisted` para env vars, `requireLocalDb()`, users + seed igual que tests existentes
- Tests para cada función: orden, joins, filtros, agregados
- Patrones de `tests/lib/valoraciones.test.ts` y `tests/db/listas.test.ts`

**Validación**: `npm run test tests/lib/actividad.test.ts`

---

## T7: e2e/actividad.spec.ts — Test E2E Playwright
**Objetivo**: Flujo completo usuario con actividad → dashboard muestra todo.

**Entregables**:
- `e2e/actividad.spec.ts`
- `createAuthUserWithUsuario` + seed via dbAdmin:
  - 1 valoración (serie aprobada)
  - 1 reseña (con valoración previa)
  - 1 lista pública con 2 series
  - 3 propuestas: pendiente, aprobada, rechazada
- Login → `/perfil/actividad`
- Assertions:
  - 5 cards agregados con valores correctos
  - 4 secciones visibles con datos
  - Propuestas: badge pendiente/aprobada/rechazada, link solo en aprobada
  - Links a `/series/<slug>` y `/listas/<id>` funcionan

**Validación**: `npm run test:e2e e2e/actividad.spec.ts` (requiere `npm run dev` + supabase local)

---

## T8: Validación completa
**Objetivo**: Ejecutar `./validate.sh` y confirmar todo en verde.

**Entregables**:
- Salida real de `./validate.sh` pegada aquí

**Comando**: `./validate.sh`

---

## Resumen de archivos

### Nuevos (6)
1. `lib/actividad.ts`
2. `components/actividad-dashboard.tsx`
3. `components/actividad-tab.tsx` (opcional)
4. `app/perfil/actividad/page.tsx`
5. `tests/lib/actividad.test.ts`
6. `e2e/actividad.spec.ts`

### Modificados (1)
1. `app/perfil/page.tsx`

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| RLS bloquea lectura de propuestas pendientes/rechazadas del propio usuario | Usar cliente con sesión (createAuthClient) en listMisPropuestas; RLS serie_select_authenticated permite leer propias filas |
| user_id NULL en propuestas anónimas no aparece en dashboard | Por diseño: solo muestra propuestas del usuario logueado. Follow-up: filtro por proponente_email |
| Promedio NaN si 0 valoraciones | `calcularAgregados` devuelve `null` para promedio si totalValoraciones === 0 |
| Portada null en valoraciones | UI usa placeholder (EmptyState o imagen por defecto) |
| Tabs CSS no funcionan bien en móvil | Fallback a `actividad-tab.tsx` cliente |

---

## Fuera de alcance (NO se hace)
- Timeline/gráfico de actividad
- Exportar CSV/JSON
- Notificaciones de cambios en propuestas
- Perfiles públicos de actividad de otros usuarios
- Comparación entre usuarios
- Paginación en listados (asumimos catálogo pequeño)
