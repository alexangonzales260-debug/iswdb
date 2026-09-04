# Tasks — Feature 018: Seguimiento de series (follow/unfollow)

Orden atómico: una sesión de Build por tarea. Cada tarea incluye código + tests.

---

## T1: Migración M11 + tipos + tests DB/RLS
**Estado**: Pendiente
**Objetivo**: Crear tabla usuario_serie + RLS + grants + tests de invariantes y RLS.

**Entregables**:
- `supabase/migrations/<ts>_create_usuario_serie.sql`:
  - `usuario_serie`: usuario_id uuid NOT NULL → public.usuario(id) on delete cascade;
    serie_id uuid NOT NULL → public.serie(id) on delete cascade;
    created_at timestamptz NOT NULL DEFAULT now();
    UNIQUE(usuario_id, serie_id) (FOL-08).
  - Sin trigger updated_at (follows no requieren update).
  - Índices: `usuario_serie_usuario_idx` (usuario_id) — /perfil/seguidas;
    `usuario_serie_serie_idx` (serie_id) — "¿quién sigue esta serie" (follow-up).
  - Grants patrón M2: select a anon/authenticated/service_role;
    insert/delete a authenticated/service_role.
  - RLS:
    - `usuario_serie_select_own`: for select to anon, authenticated
      using (usuario_id = auth.uid()).
    - `usuario_serie_insert_own`: for insert to authenticated
      with check (usuario_id = auth.uid()).
    - `usuario_serie_delete_own`: for delete to authenticated
      using (usuario_id = auth.uid()).
  - FK cascade: borrar usuario → follows borrados; borrar serie → follows
    borrados (FOL-07).
- `supabase db reset` + `npm run gen:types` (types/database.ts incluye
  usuario_serie; verificar .from('usuario_serie') funciona).
- `tests/db/follows-rls.test.ts`:
  - Fixture: 2 usuarios (owner, ajeno), 2 series aprobadas.
  - Invariantes: seguir crea fila · duplicado → 23505 · dejar de seguir borra
    · cascade borrar serie → follow borrado.
  - RLS: owner lee sus follows ok · ajeno no ve follows del owner (0 filas) ·
    anon no puede insert (denegado) · owner inserta ok · ajeno no inserta
    follow con usuario_id del owner (denegado) · owner borra ok · ajeno no
    borra follow del owner (denegado).

**Validación**: `npm test -- --run tests/db/follows-rls.test.ts` verde (BD local arriba).

---

## T2: Servicios en lib/follows.ts + tests
**Estado**: Pendiente
**Objetivo**: Crear servicios inyectables para seguir/dejar/listar follows.

**Entregables**:
- `lib/follows.ts`:
  - `seguirSerie(client, userId, serieId)`: insert { usuario_id, serie_id }.
    Si falla con 23505 → silencioso (idempotente, FOL-08).
  - `dejarDeSeguirSerie(client, userId, serieId)`: delete por usuario_id + serieId.
    Idempotente (0 filas borradas no es error).
  - `estaSiguiendo(client, userId, serieId)`: select count(*) → boolean.
  - `listMisSeguidas(client, userId)`: select de usuario_serie → join serie
    (titulo, slug, portada_url), order by created_at desc.
- Tipos TypeScript exportados: `SerieSeguida`.
- `tests/lib/follows.test.ts`:
  - Fixture: usuario + serie aprobada.
  - seguirSerie: crea follow → estaSiguiendo true.
  - seguirSerie duplicado: 23505 → silencioso (no lanza).
  - dejarDeSeguirSerie: borra follow → estaSiguiendo false.
  - dejarDeSeguirSerie inexistente: idempotente (no lanza).
  - estaSiguiendo: true/false según estado.
  - listMisSeguidas: orden desc, join serie (titulo, slug, portada_url).

**Validación**: `npm test -- --run tests/lib/follows.test.ts` verde.

---

## T3: Server Actions + componentes + páginas + integración en ficha
**Estado**: Pendiente
**Objetivo**: Actions, componente botón, página /perfil/seguidas e integración en ficha.

**Entregables**:
- `lib/follows-actions.ts` (nuevo, "use server"):
  - `accionSeguir(serieId)`: requireUser({ next, message }) → createAuthClient()
    → seguirSerie → revalidatePath('/series/<slug>') + revalidatePath('/perfil/seguidas')
    → { ok: true } en éxito.
  - `accionDejarDeSeguir(serieId)`: patrón idéntico con dejarDeSeguirSerie.
- `components/follow-button.tsx` (nuevo, "use client"):
  - Props: `serieId`, `serieSlug`, `siguiendoInicial`.
  - Estado: `siguiendo` (bool), `pending` (useTransition).
  - Render: botón con texto "Seguir" / "Siguiendo" según estado.
  - Click: alterna estado (optimista) + llama a la action.
- `app/perfil/seguidas/page.tsx` (nuevo, RSC, force-dynamic):
  - `export const dynamic = "force-dynamic"`.
  - requireUser({ next: "/perfil/seguidas" }) → createAuthClient() →
    listMisSeguidas(userId) → grid de tarjetas (portada, título, link a ficha).
  - EmptyState si seguidas.length === 0.
- `app/series/[slug]/page.tsx` (modificar):
  - Obtener `siguiendo` con `estaSiguiendo(client, user.id, serie.id)` solo si
    `user !== null`.
  - Renderizar `<FollowButton serieId={serie.id} serieSlug={serie.slug}
    siguiendoInicial={siguiendo} />` solo si `user !== null` (FOL-06).
- `app/perfil/page.tsx` (modificar):
  - Añadir en sección "Datos de la cuenta", junto a "Ver mi actividad":
    ```tsx
    <Link href="/perfil/seguidas" className="text-brand underline-offset-2 hover:underline">
      Ver mis series seguidas
    </Link>
    ```

**Validación**: `npm run lint && npm run typecheck && npm run build` verdes;
smoke manual en dev (seguir → botón cambia → /perfil/seguidas → dejar de seguir
→ desaparece; sin sesión en /perfil/seguidas → redirect).

---

## T4: E2E Playwright
**Estado**: Pendiente
**Objetivo**: Flujo completo seguir desde ficha → visible en /perfil/seguidas → dejar de seguir.

**Entregables**:
- `e2e/follows.spec.ts`:
  - createAuthUserWithUsuario + seed de serie aprobada (vía dbAdmin).
  - Login → ficha de serie → click "Seguir" → botón cambia a "Siguiendo".
  - Navegar a /perfil/seguidas → serie visible con título y link.
  - Volver a ficha → click "Siguiendo" → botón cambia a "Seguir".
  - Volver a /perfil/seguidas → serie ya no visible.
  - Sin sesión en /perfil/seguidas → redirect a /login.

**Validación**: `npm run test:e2e e2e/follows.spec.ts` verde; sin regresiones.

---

## T5: validate.sh + cierre
**Estado**: Pendiente
**Objetivo**: Ejecutar validate.sh y actualizar docs de cierre.

**Entregables**:
- `./validate.sh` completo (salida real pegada).
- `ROADMAP.md`: 018 ✅.
- `DECISIONS.md`: Dxx "Seguimiento de series: modelo usuario_serie, RLS own,
  revalidación acotada, sin trigger updated_at".
- `docs/memory/session-log.md`: sesión F018.

**Validación**: `./validate.sh` en verde; Definition of Done completa.

---

## Resumen de archivos

### Nuevos (8)
1. `supabase/migrations/<ts>_create_usuario_serie.sql` (M11)
2. `lib/follows.ts`
3. `lib/follows-actions.ts`
4. `components/follow-button.tsx`
5. `app/perfil/seguidas/page.tsx`
6. `tests/db/follows-rls.test.ts`
7. `tests/lib/follows.test.ts`
8. `e2e/follows.spec.ts`

### Modificados (2)
1. `app/series/[slug]/page.tsx` (FollowButton)
2. `app/perfil/page.tsx` (link "Ver mis series seguidas")

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| RLS de usuario_serie depende de auth.uid() directo (no subquery) | Más simple que F013; tests RLS en T1 verifican owner vs ajeno vs anon |
| Estado inicial del botón necesita userId | getUser() cacheada en header; se reutiliza en la ficha; sin sesión → componente no se renderiza |
| 23505 en seguirSerie (duplicado) | servicio captura y silencia (idempotente); cliente siempre recibe { ok: true } |
| Revalidación acotada (no global) | Solo revalide /series/<slug> y /perfil/seguidas; más eficiente que revalidatePath('/', 'layout') |
| Cascade borrar usuario → follows borrados | Correcto por FK ON DELETE CASCADE; GoTrue deleteAuthUser → cascade |

---

## Fuera de alcance (NO se hace)
- Notificaciones de nuevos episodios (follow-up F019)
- Categorías de seguimiento (favoritas, viendo, completada, pendiente)
- Notas personales en el follow
- Recomendaciones basadas en follows
- Exportar/importar follows
- Perfiles públicos de follows de otros usuarios
- Paginación en /perfil/seguidas
- Contador de seguidores en la ficha
