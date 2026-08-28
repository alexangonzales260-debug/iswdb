import { notFound } from 'next/navigation'
import type { AuthClient } from './auth'
import { unwrap } from './series'

// ── F010 · Guard de rol (ADM-04) ────────────────────────────────────────────

export type RolUsuario = 'user' | 'mod' | 'admin'

export const ERRORES_ADMIN = {
  serieNoEncontrada: 'Serie no encontrada'
} as const

// Rol de la sesión (D10): null si no hay fila en public.usuario. RLS
// usuario_select_authenticated: solo legible con cliente autenticado.
export async function getRolUsuario(
  client: AuthClient,
  userId: string
): Promise<RolUsuario | null> {
  const fila = await unwrap(client.from('usuario').select('rol').eq('id', userId).maybeSingle())
  if (!fila) return null
  // El CHECK de usuario.rol garantiza que el valor es uno de los tres.
  return fila.rol as RolUsuario
}

// Guard de /admin (ADM-04): sin sesión, o con rol distinto de mod/admin,
// notFound() — no redirect a /login: no se revela la existencia del panel.
// Inyectable para tests: las páginas/actions pasan el resultado de getUser()
// y el cliente de createAuthClient().
export async function requireMod(
  client: AuthClient,
  user: { id: string } | null
): Promise<void> {
  if (!user) notFound()
  const rol = await getRolUsuario(client, user.id)
  if (rol !== 'mod' && rol !== 'admin') notFound()
}

// ── F010 · Lecturas del dashboard (ADM-01) ─────────────────────────────────

// serie_select_public usa `using (true)` (M3): CUALQUIER lector (incluso
// anon) puede leer series pendientes/rechazadas. La protección del panel es
// el guard requireMod en la UI y las políticas de ESCRITURA (is_admin_or_mod);
// estas lecturas no filtran por rol a propósito.
const SERIE_ADMIN_SELECT = `
  id,
  titulo,
  slug,
  moderation_status,
  created_at,
  categoria ( nombre, slug )
` as const

export interface SerieAdmin {
  id: string
  titulo: string
  slug: string
  moderation_status: string
  created_at: string
  categoria: { nombre: string; slug: string } | null
}

function serieAdminQuery(client: AuthClient) {
  return client.from('serie').select(SERIE_ADMIN_SELECT)
}

type SerieAdminRow = NonNullable<Awaited<ReturnType<typeof serieAdminQuery>>['data']>[number]

function toSerieAdmin(row: SerieAdminRow): SerieAdmin {
  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    moderation_status: row.moderation_status,
    created_at: row.created_at,
    categoria: row.categoria ? { nombre: row.categoria.nombre, slug: row.categoria.slug } : null
  }
}

// Cola de moderación (ADM-01): pendientes por orden de llegada (FIFO).
export async function listSeriesPendientes(client: AuthClient): Promise<SerieAdmin[]> {
  const filas = await unwrap(
    serieAdminQuery(client)
      .eq('moderation_status', 'pendiente')
      .order('created_at', { ascending: true })
  )
  return filas.map(toSerieAdmin)
}

// Listado completo del dashboard (ADM-01): todas las series con su estado,
// más recientes primero.
export async function listTodasSeries(client: AuthClient): Promise<SerieAdmin[]> {
  const filas = await unwrap(serieAdminQuery(client).order('created_at', { ascending: false }))
  return filas.map(toSerieAdmin)
}

// ── F010 · Ficha para editar (ADM-06) ──────────────────────────────────────

const SERIE_EDITAR_SELECT = `
  id,
  titulo,
  slug,
  descripcion,
  portada_url,
  estado,
  anio_inicio,
  anio_fin,
  playlist_url,
  moderation_status,
  categoria ( id, nombre, slug ),
  participa ( rol, canal ( id, nombre, handle, avatar_url ) ),
  episodio ( id, temporada, numero, titulo, video_id )
` as const

function serieEditarQuery(client: AuthClient, slug: string) {
  return client.from('serie').select(SERIE_EDITAR_SELECT).eq('slug', slug)
}

type SerieEditarRow = NonNullable<Awaited<ReturnType<typeof serieEditarQuery>>['data']>[number]
type ParticipaEditarRow = SerieEditarRow['participa'][number]

export interface CanalEdicion {
  canal_id: string
  nombre: string
  handle: string
  avatar_url: string | null
  rol: string
}

export interface EpisodioEdicion {
  id: string
  temporada: number
  numero: number
  titulo: string
  video_id: string
}

export interface SerieParaEditar {
  id: string
  titulo: string
  slug: string
  descripcion: string | null
  portada_url: string | null
  estado: string
  anio_inicio: number | null
  anio_fin: number | null
  playlist_url: string | null
  moderation_status: string
  categoria: { id: string; nombre: string; slug: string } | null
  canales: CanalEdicion[]
  episodios: EpisodioEdicion[]
}

function toCanalesEdicion(filas: ParticipaEditarRow[]): CanalEdicion[] {
  return filas
    .filter(
      (fila): fila is ParticipaEditarRow & { canal: NonNullable<ParticipaEditarRow['canal']> } =>
        fila.canal !== null
    )
    .map((fila) => ({
      canal_id: fila.canal.id,
      nombre: fila.canal.nombre,
      handle: fila.canal.handle,
      avatar_url: fila.canal.avatar_url,
      rol: fila.rol
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// PostgREST no garantiza orden en los embeds: temporada asc, numero asc en TS
// (patrón toTemporadas de lib/series.ts).
function toEpisodiosEdicion(filas: SerieEditarRow['episodio']): EpisodioEdicion[] {
  return filas
    .map((fila) => ({
      id: fila.id,
      temporada: fila.temporada,
      numero: fila.numero,
      titulo: fila.titulo,
      video_id: fila.video_id
    }))
    .sort((a, b) => a.temporada - b.temporada || a.numero - b.numero)
}

// Serie completa para el formulario de edición (ADM-06); null si el slug no
// existe → la página responde notFound().
export async function getSerieParaEditar(
  client: AuthClient,
  slug: string
): Promise<SerieParaEditar | null> {
  const row = await unwrap(serieEditarQuery(client, slug).maybeSingle())
  if (!row) return null
  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    descripcion: row.descripcion,
    portada_url: row.portada_url,
    estado: row.estado,
    anio_inicio: row.anio_inicio,
    anio_fin: row.anio_fin,
    playlist_url: row.playlist_url,
    moderation_status: row.moderation_status,
    categoria: row.categoria
      ? { id: row.categoria.id, nombre: row.categoria.nombre, slug: row.categoria.slug }
      : null,
    canales: toCanalesEdicion(row.participa),
    episodios: toEpisodiosEdicion(row.episodio)
  }
}

// ── F010 · Moderación (ADM-02/ADM-03) ──────────────────────────────────────

// serie_update_admin_mod: para un no-mod la política USING oculta la fila
// (0 filas afectadas, sin error) → lanza el mismo error que si no existiera
// (no revela existencia). Para mod/admin, 0 filas = slug inexistente.
async function setModerationStatus(
  client: AuthClient,
  slug: string,
  moderationStatus: 'aprobada' | 'rechazada'
): Promise<void> {
  const filas = await unwrap(
    client.from('serie').update({ moderation_status: moderationStatus }).eq('slug', slug).select('id')
  )
  if (filas.length === 0) throw new Error(ERRORES_ADMIN.serieNoEncontrada)
}

export function aprobarSerie(client: AuthClient, slug: string): Promise<void> {
  return setModerationStatus(client, slug, 'aprobada')
}

export function rechazarSerie(client: AuthClient, slug: string): Promise<void> {
  return setModerationStatus(client, slug, 'rechazada')
}
