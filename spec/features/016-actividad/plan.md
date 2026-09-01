# Plan técnico — Feature 016: Dashboard "Mi actividad"

## Arquitectura y decisiones

### Patrones existentes a seguir
- **Servicios inyectables** en `lib/` (patrón F009/F012/F013): funciones que reciben `AuthClient` por parámetro, testeables sin request context de Next.
- **RSC con `force-dynamic`** para páginas protegidas (`app/perfil/page.tsx`).
- **Server Components por defecto**, `"use client"` solo con justificación (tabs interactivos).
- **RLS**: lectura propia de valoración/reseña/lista/serie via cliente con sesión; propuestas usan `user_id` nullable.
- **Agregados en servidor** (D16): calculados en lectura, sin caché ni materialización.

### Decisiones de diseño
1. **Tabs**: CSS puro con anchors (`:target`) para evitar JS si es posible; si la UX lo requiere, componente cliente mínimo.
2. **Propuestas anónimas**: solo se muestran las del usuario logueado (`user_id = userId`). Follow-up: mostrar por `proponente_email` si coincide con email del usuario.
3. **Agregados**: función pura `calcularAgregados(valoraciones, reseñas, listas, propuestas)` en `lib/actividad.ts`.
4. **Imagen de portada**: join con `serie.portada_url` en listMisValoraciones.

## Archivos a crear/modificar

### Nuevos
1. `lib/actividad.ts` — Servicios del dashboard
2. `app/perfil/actividad/page.tsx` — Página RSC protegida
3. `components/actividad-dashboard.tsx` — Dashboard (Server Component)
4. `components/actividad-tab.tsx` — Tab interactivo (Client Component, si necesario)
5. `tests/lib/actividad.test.ts` — Tests de servidor
6. `e2e/actividad.spec.ts` — Test E2E Playwright

### Modificar
1. `app/perfil/page.tsx` — Añadir link "Ver mi actividad"

## Servicios en `lib/actividad.ts`

```typescript
// Tipos de retorno
interface MiValoracion {
  nota: number
  created_at: string
  serie: { titulo: string; slug: string; portada_url: string | null; categoria: { nombre: string } | null }
}

interface MiReseña {
  id: string
  contenido: string
  created_at: string
  serie: { titulo: string; slug: string }
}

interface MiLista {
  id: string
  nombre: string
  descripcion: string | null
  es_publica: boolean
  updated_at: string
  numSeries: number
}

interface MiPropuesta {
  id: string
  titulo: string
  moderation_status: 'pendiente' | 'aprobada' | 'rechazada'
  created_at: string
  slug: string | null // null si rechazada (no hay ficha pública)
}

interface AgregadosActividad {
  totalValoraciones: number
  promedioDado: number | null
  totalReseñas: number
  totalListas: number
  totalPropuestas: number
}

// Servicios (inyectables, reciben AuthClient)
export async function listMisValoraciones(client: AuthClient, userId: string): Promise<MiValoracion[]>
export async function listMisReseñas(client: AuthClient, userId: string): Promise<MiReseña[]>
export async function listMisPropuestas(client: AuthClient, userId: string): Promise<MiPropuesta[]>
export function calcularAgregados(
  valoraciones: MiValoracion[],
  reseñas: MiReseña[],
  listas: MiLista[],
  propuestas: MiPropuesta[]
): AgregadosActividad
```

### Detalles de consultas

**listMisValoraciones**: join `valoracion` → `serie(titulo, slug, portada_url, categoria(nombre))`, order by `created_at desc`. Filtra `serie IS NOT NULL`.

**listMisReseñas**: join `reseña` → `serie(titulo, slug)`, order by `created_at desc`. Incluye `contenido` para extracto (primeros ~150 chars en UI).

**listMisPropuestas**: `serie` where `user_id = userId` AND `moderation_status IN ('pendiente','aprobada','rechazada')`, order by `created_at desc`. Incluye `slug` solo si `aprobada`.

**calcularAgregados**: 
- `totalValoraciones = valoraciones.length`
- `promedioDado = totalValoraciones > 0 ? valoraciones.reduce((a,b) => a + b.nota, 0) / totalValoraciones : null`
- `totalReseñas = reseñas.length`
- `totalListas = listas.length`
- `totalPropuestas = propuestas.length`

## Página `app/perfil/actividad/page.tsx`

```typescript
export const dynamic = "force-dynamic"

export default async function ActividadPage() {
  const user = await requireUser({ next: "/perfil/actividad" })
  const client = await createAuthClient()
  
  const [valoraciones, reseñas, listas, propuestas] = await Promise.all([
    listMisValoraciones(client, user.id),
    listMisReseñas(client, user.id),
    listMisListas(client, user.id), // reutiliza lib/listas.ts
    listMisPropuestas(client, user.id)
  ])
  
  const agregados = calcularAgregados(valoraciones, reseñas, listas, propuestas)
  
  return <ActividadDashboard agregados={agregados} valoraciones={valoraciones} reseñas={reseñas} listas={listas} propuestas={propuestas} />
}
```

## Componente `components/actividad-dashboard.tsx`

- **Server Component** (recibe props del RSC)
- Sección **Agregados**: 5 cards con conteos + promedio (formato 1 decimal)
- **Tabs/Secciones**: 4 paneles (Valoraciones, Reseñas, Listas, Propuestas)
  - Valoraciones: link a `/series/<slug>`, nota, fecha, portada (thumbnail pequeño)
  - Reseñas: link a `/series/<slug>`, extracto (150 chars + "…"), fecha
  - Listas: link a `/listas/<id>`, nombre, nº series, badge pública/privada
  - Propuestas: título, badge estado, link a ficha si aprobada / texto "Rechazada" si rechazada
- Estados vacíos con `EmptyState` por sección

## Componente `components/actividad-tab.tsx` (opcional)

Si tabs con CSS puro no es suficiente: Client Component mínimo con `useState` para tab activo. Preferir anchors CSS si cubre el caso.

## Integración en `app/perfil/page.tsx`

Añadir en la sección "Datos de la cuenta" o al final:
```tsx
<Link href="/perfil/actividad" className="text-brand underline-offset-2 hover:underline">
  Ver mi actividad
</Link>
```

## Tests

### `tests/lib/actividad.test.ts`
- Fixture: usuario con valoraciones, reseñas, listas, propuestas (aprobada/rechazada/pendiente)
- `listMisValoraciones`: orden desc, join serie + portada + categoria
- `listMisReseñas`: orden desc, join serie
- `listMisPropuestas`: filtra por user_id, incluye estado, slug solo si aprobada
- `calcularAgregados`: conteos correctos, promedio con 1 decimal, null si 0 valoraciones

### `e2e/actividad.spec.ts`
- Crea usuario vía API
- Crea seed: 1 valoración, 1 reseña, 1 lista (2 series), 3 propuestas (pendiente/aprobada/rechazada)
- Login → `/perfil/actividad`
- Verifica: 5 cards agregados, 4 secciones con datos, estados de propuestas, links correctos

## Riesgos técnicos

1. **RLS lectura propia**: `valoracion`/`reseña`/`lista`/`serie` tienen RLS que permite leer propias filas con cliente autenticado. Verificar que `listMisPropuestas` usa cliente con sesión (no anon) para ver propuestas del usuario aunque estén `pendiente`/`rechazada`.

2. **`user_id` nullable en propuestas**: Las propuestas anónimas tienen `user_id = NULL`. Solo se muestran las del usuario logueado (`WHERE user_id = $userId`). Follow-up documentado: mostrar por `proponente_email` si coincide.

3. **Agregados en servidor**: Cálculo en RSC (D16). Sin caché. Correcto para catálogo pequeño.

4. **Portada en valoraciones**: `serie.portada_url` puede ser null. UI debe manejar placeholder.

5. **Extracto de reseña**: Cortar en ~150 chars server-side o client-side. Hacerlo en UI para mantener datos completos en props.

## Fuera de alcance (no se hará)
- Timeline/gráfico de actividad
- Exportar CSV/JSON
- Notificaciones de cambios en propuestas
- Perfiles públicos de actividad de otros usuarios
- Comparación entre usuarios
