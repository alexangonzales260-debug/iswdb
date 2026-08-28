import { notFound } from 'next/navigation'
import { z } from 'zod'
import type { AuthClient } from './auth'
import { unwrap } from './series'

// ── F010 · Guard de rol (ADM-04) ────────────────────────────────────────────

export type RolUsuario = 'user' | 'mod' | 'admin'

export const ERRORES_ADMIN = {
  serieNoEncontrada: 'Serie no encontrada',
  tituloRequerido: 'El título es obligatorio',
  categoriaNoExiste: 'La categoría no existe',
  aniosInvalidos: 'El año de fin no puede ser anterior al de inicio',
  slugDuplicado: 'Ya existe una serie con ese slug',
  episodioDuplicado: 'Temporada y número de episodio duplicados',
  canalDuplicado: 'Canal duplicado en la serie',
  datosInvalidos: 'Revisa los datos del formulario'
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
  categoria ( nombre, slug ),
  participa ( canal ( nombre, handle ) )
` as const

export interface SerieAdmin {
  id: string
  titulo: string
  slug: string
  moderation_status: string
  created_at: string
  categoria: { nombre: string; slug: string } | null
  canales: { nombre: string; handle: string }[]
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
    categoria: row.categoria ? { nombre: row.categoria.nombre, slug: row.categoria.slug } : null,
    canales: row.participa
      .map((p) => p.canal)
      .filter((canal): canal is NonNullable<typeof canal> => canal !== null)
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

// ── F010 · CRUD (ADM-05/ADM-06) ────────────────────────────────────────────

export interface CanalDatos {
  canal_id: string
  rol: 'principal' | 'colaborador' | 'invitado'
}

export interface EpisodioDatos {
  id?: string
  temporada: number
  numero: number
  titulo: string
  video_id: string
}

export interface SerieDatos {
  titulo: string
  descripcion?: string | null
  categoria: string
  estado: 'activa' | 'finalizada'
  anio_inicio?: number | null
  anio_fin?: number | null
  playlist_url?: string | null
  portada_url?: string | null
  canales?: CanalDatos[]
  episodios?: EpisodioDatos[]
}

// Los formularios envían '' para los campos opcionales vacíos; se normaliza
// a null antes de validar.
function vacioANull(valor: unknown): unknown {
  return valor === '' ? null : valor
}

const anioSchema = z.preprocess(vacioANull, z.number().int().min(1900).max(2100).nullish())

export const schemaParticipa = z.object({
  canal_id: z.uuid(),
  rol: z.enum(['principal', 'colaborador', 'invitado'])
})

export const schemaEpisodio = z.object({
  // id presente solo en episodios existentes (edición); los nuevos se insertan.
  id: z.uuid().optional(),
  temporada: z.number().int().min(1),
  numero: z.number().int().min(1),
  titulo: z.string().min(1, ERRORES_ADMIN.datosInvalidos),
  video_id: z.string().min(1, ERRORES_ADMIN.datosInvalidos)
})

export const schemaSerie = z
  .object({
    titulo: z.string().trim().min(1, ERRORES_ADMIN.tituloRequerido),
    descripcion: z.preprocess(vacioANull, z.string().nullish()),
    categoria: z.string().min(1, ERRORES_ADMIN.categoriaNoExiste),
    estado: z.enum(['activa', 'finalizada']),
    anio_inicio: anioSchema,
    anio_fin: anioSchema,
    playlist_url: z.preprocess(vacioANull, z.url().nullish()),
    portada_url: z.preprocess(vacioANull, z.url().nullish()),
    canales: z.array(schemaParticipa).default([]),
    episodios: z.array(schemaEpisodio).default([])
  })
  .refine(
    (datos) =>
      datos.anio_inicio == null || datos.anio_fin == null || datos.anio_fin >= datos.anio_inicio,
    { message: ERRORES_ADMIN.aniosInvalidos }
  )

function parsearSerieDatos(datos: SerieDatos): z.output<typeof schemaSerie> {
  const parsed = schemaSerie.safeParse(datos)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_ADMIN.datosInvalidos)
  }
  return parsed.data
}

// Slug URL: minúsculas, sin acentos, separadores por guiones.
export function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Slug único autogenerado (ADM-05): base desde el título; si está ocupado,
// sufijo -2, -3… El constraint unique de serie.slug queda de backstop para
// carreras (23505 → slugDuplicado).
export async function generarSlugUnico(client: AuthClient, titulo: string): Promise<string> {
  const base = slugify(titulo) || 'serie'
  let candidato = base
  let sufijo = 2
  for (;;) {
    const existente = await unwrap(
      client.from('serie').select('slug').eq('slug', candidato).maybeSingle()
    )
    if (!existente) return candidato
    candidato = `${base}-${sufijo}`
    sufijo += 1
  }
}

// 23505 (violación de unique) → error amigable según el constraint;
// cualquier otro error se propaga con su mensaje original.
function errorEscritura(error: { message: string; code?: string }): Error {
  if (error.code === '23505') {
    if (error.message.includes('serie_slug_key')) return new Error(ERRORES_ADMIN.slugDuplicado)
    if (error.message.includes('episodio')) return new Error(ERRORES_ADMIN.episodioDuplicado)
    if (error.message.includes('participa')) return new Error(ERRORES_ADMIN.canalDuplicado)
  }
  return new Error(error.message)
}

async function categoriaPorSlug(client: AuthClient, slug: string): Promise<string> {
  const categoria = await unwrap(
    client.from('categoria').select('id').eq('slug', slug).maybeSingle()
  )
  if (!categoria) throw new Error(ERRORES_ADMIN.categoriaNoExiste)
  return categoria.id
}

export interface SerieCreada {
  id: string
  slug: string
}

// Crea la serie con sus canales (participa) y episodios (ADM-05) en pasos
// secuenciales CON COMPENSACIÓN: PostgREST no soporta inserts anidados
// (verificado en 16.1: PGRST204), así que no hay transacción de un solo
// request. Si falla un insert hijo, se borra la serie recién creada (FK
// cascade sobre participa/episodio) y se relanza el error → all-or-nothing
// efectivo. Ventana residual: que la propia compensación falle (quedaría una
// serie huérfana sin hijos, limpiable a mano; asumible a escala de catálogo).
export async function crearSerie(client: AuthClient, datos: SerieDatos): Promise<SerieCreada> {
  const parsed = parsearSerieDatos(datos)
  const categoriaId = await categoriaPorSlug(client, parsed.categoria)
  const slug = await generarSlugUnico(client, parsed.titulo)

  const { data, error } = await client
    .from('serie')
    .insert({
      titulo: parsed.titulo,
      slug,
      descripcion: parsed.descripcion ?? null,
      categoria_id: categoriaId,
      estado: parsed.estado,
      anio_inicio: parsed.anio_inicio ?? null,
      anio_fin: parsed.anio_fin ?? null,
      playlist_url: parsed.playlist_url ?? null,
      portada_url: parsed.portada_url ?? null
    })
    .select('id, slug')
  if (error) throw errorEscritura(error)
  const fila = data?.[0]
  if (!fila) throw new Error(ERRORES_ADMIN.datosInvalidos)

  try {
    if (parsed.canales.length > 0) {
      const { error: errorParticipa } = await client.from('participa').insert(
        parsed.canales.map(({ canal_id, rol }) => ({ serie_id: fila.id, canal_id, rol }))
      )
      if (errorParticipa) throw errorParticipa
    }
    if (parsed.episodios.length > 0) {
      const { error: errorEpisodio } = await client.from('episodio').insert(
        parsed.episodios.map(({ temporada, numero, titulo, video_id }) => ({
          serie_id: fila.id,
          temporada,
          numero,
          titulo,
          video_id
        }))
      )
      if (errorEpisodio) throw errorEpisodio
    }
  } catch (error) {
    // Compensación: borrar la serie (cascade borra participa y episodio).
    await client.from('serie').delete().eq('id', fila.id)
    if (typeof error === 'object' && error !== null && 'message' in error) {
      throw errorEscritura(error as { message: string; code?: string })
    }
    throw error
  }
  return fila
}

// Edita campos básicos (slug INMUTABLE) y sincroniza canales/episodios en
// pasos secuenciales idempotentes (decisión 4 del plan): update de serie →
// delete de participa ausentes + upsert del resto → delete de episodios
// ausentes + upsert del resto. Cada paso es idempotente y reintentable; un
// fallo parcial deja estado consistente (riesgo 1 del plan).
export async function editarSerie(
  client: AuthClient,
  slug: string,
  datos: SerieDatos
): Promise<void> {
  const parsed = parsearSerieDatos(datos)

  // Lectura pública (serie_select_public): resuelve el id; para un no-mod el
  // update posterior no verá la fila por RLS → mismo error que inexistente.
  const serie = await unwrap(client.from('serie').select('id').eq('slug', slug).maybeSingle())
  if (!serie) throw new Error(ERRORES_ADMIN.serieNoEncontrada)
  const categoriaId = await categoriaPorSlug(client, parsed.categoria)

  const { data: actualizadas, error: errorUpdate } = await client
    .from('serie')
    .update({
      titulo: parsed.titulo,
      descripcion: parsed.descripcion ?? null,
      categoria_id: categoriaId,
      estado: parsed.estado,
      anio_inicio: parsed.anio_inicio ?? null,
      anio_fin: parsed.anio_fin ?? null,
      playlist_url: parsed.playlist_url ?? null,
      portada_url: parsed.portada_url ?? null
    })
    .eq('id', serie.id)
    .select('id')
  if (errorUpdate) throw errorEscritura(errorUpdate)
  if ((actualizadas ?? []).length === 0) throw new Error(ERRORES_ADMIN.serieNoEncontrada)

  // participa: borrar canales ausentes; upsert del resto (onConflict en la PK
  // serie_id,canal_id → crea nuevos y actualiza el rol de los existentes).
  const canalIds = parsed.canales.map((canal) => canal.canal_id)
  let borradoParticipa = client.from('participa').delete().eq('serie_id', serie.id)
  if (canalIds.length > 0) {
    borradoParticipa = borradoParticipa.not('canal_id', 'in', `(${canalIds.join(',')})`)
  }
  const { error: errorBorradoParticipa } = await borradoParticipa
  if (errorBorradoParticipa) throw new Error(errorBorradoParticipa.message)

  if (parsed.canales.length > 0) {
    const { error: errorParticipa } = await client.from('participa').upsert(
      parsed.canales.map(({ canal_id, rol }) => ({ serie_id: serie.id, canal_id, rol })),
      { onConflict: 'serie_id,canal_id' }
    )
    if (errorParticipa) throw errorEscritura(errorParticipa)
  }

  // episodio: borrar por id los ausentes; upsert del resto (onConflict id →
  // actualiza los existentes con id e inserta los nuevos sin id).
  const idsEpisodios = parsed.episodios
    .filter((episodio): episodio is EpisodioDatos & { id: string } => Boolean(episodio.id))
    .map((episodio) => episodio.id)
  let borradoEpisodio = client.from('episodio').delete().eq('serie_id', serie.id)
  if (idsEpisodios.length > 0) {
    borradoEpisodio = borradoEpisodio.not('id', 'in', `(${idsEpisodios.join(',')})`)
  }
  const { error: errorBorradoEpisodio } = await borradoEpisodio
  if (errorBorradoEpisodio) throw new Error(errorBorradoEpisodio.message)

  if (parsed.episodios.length > 0) {
    // defaultToNull:false → Prefer: missing=default: a las filas nuevas (sin
    // id) PostgREST les aplica gen_random_uuid() en vez de NULL en el bulk.
    const { error: errorEpisodio } = await client.from('episodio').upsert(
      parsed.episodios.map((episodio) => ({
        ...(episodio.id ? { id: episodio.id } : {}),
        serie_id: serie.id,
        temporada: episodio.temporada,
        numero: episodio.numero,
        titulo: episodio.titulo,
        video_id: episodio.video_id
      })),
      { onConflict: 'id', defaultToNull: false }
    )
    if (errorEpisodio) throw errorEscritura(errorEpisodio)
  }
}
