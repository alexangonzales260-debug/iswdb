import { createServiceRoleClient } from './supabase'

export interface PerfilUsuario {
  username: string
  display_name: string | null
  created_at: string
}

export interface SerieSeguidaPublica {
  created_at: string
  serie: { titulo: string; slug: string; portada_url: string | null }
}

export interface ValoracionPublica {
  nota: number
  created_at: string
  serie: { titulo: string; slug: string }
}

export interface ReseñaPublica {
  id: string
  contenido: string
  created_at: string
  serie: { titulo: string; slug: string }
}

export interface ListaPublica {
  id: string
  nombre: string
  descripcion: string | null
  es_publica: boolean
  updated_at: string
  numSeries: number
}

export interface PerfilPublicoData {
  usuario: PerfilUsuario
  seguidas: SerieSeguidaPublica[]
  valoraciones: ValoracionPublica[]
  resenasPublicas: ReseñaPublica[]
  listasPublicas: ListaPublica[]
}

function seguidasQuery(client: ReturnType<typeof createServiceRoleClient>, userId: string) {
  return client
    .from('usuario_serie')
    .select('created_at, serie!inner ( titulo, slug, portada_url, moderation_status )')
    .eq('usuario_id', userId)
    .eq('serie.moderation_status', 'aprobada')
    .order('created_at', { ascending: false })
}

type SeguidaRow = NonNullable<Awaited<ReturnType<typeof seguidasQuery>>['data']>[number]

function conSerieSeguida(
  fila: SeguidaRow
): fila is SeguidaRow & { serie: { titulo: string; slug: string; portada_url: string | null } } {
  return fila.serie !== null
}

function valoracionesQuery(client: ReturnType<typeof createServiceRoleClient>, userId: string) {
  return client
    .from('valoracion')
    .select('nota, created_at, serie!inner ( titulo, slug, moderation_status )')
    .eq('user_id', userId)
    .eq('serie.moderation_status', 'aprobada')
    .order('created_at', { ascending: false })
}

type ValoracionRow = NonNullable<Awaited<ReturnType<typeof valoracionesQuery>>['data']>[number]

function conSerieValoracion(
  fila: ValoracionRow
): fila is ValoracionRow & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

function resenasQuery(client: ReturnType<typeof createServiceRoleClient>, userId: string) {
  return client
    .from('reseña')
    .select('id, contenido, created_at, serie!inner ( titulo, slug, moderation_status )')
    .eq('user_id', userId)
    .eq('serie.moderation_status', 'aprobada')
    .order('created_at', { ascending: false })
}

type ReseñaRow = NonNullable<Awaited<ReturnType<typeof resenasQuery>>['data']>[number]

function conSerieReseña(
  fila: ReseñaRow
): fila is ReseñaRow & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

// Listas públicas del usuario con nº de series (patrón listMisListas de
// lib/listas.ts): conteo de lista_serie por lista_id IN tras la lectura.
async function listasPublicasDe(
  client: ReturnType<typeof createServiceRoleClient>,
  userId: string
): Promise<ListaPublica[]> {
  const { data, error } = await client
    .from('lista')
    .select('id, nombre, descripcion, es_publica, updated_at')
    .eq('user_id', userId)
    .eq('es_publica', true)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`getPerfilPublico: ${error.message}`)

  const listas = data ?? []
  if (listas.length === 0) return []

  const { data: conteos, error: errorConteos } = await client
    .from('lista_serie')
    .select('lista_id')
    .in('lista_id', listas.map((l) => l.id))
  if (errorConteos) throw new Error(`getPerfilPublico: ${errorConteos.message}`)

  const numSeries = new Map<string, number>()
  for (const fila of conteos ?? []) {
    numSeries.set(fila.lista_id, (numSeries.get(fila.lista_id) ?? 0) + 1)
  }

  return listas.map((l) => ({ ...l, numSeries: numSeries.get(l.id) ?? 0 }))
}

// Datos públicos de un perfil (F021): cross-user vía service_role server-side
// (D25/D26) porque el RLS de usuario (M7) y usuario_serie (M11) es solo-propio.
// Nunca se selecciona email ni rol (el id se usa internamente para las lecturas
// del hijo y se descarta del retorno). Las series se filtran a aprobadas en los
// embeds (serie!inner elimina la fila padre si la serie no pasa el filtro) y
// las listas solo es_publica = true. null si el username no existe.
export async function getPerfilPublico(username: string): Promise<PerfilPublicoData | null> {
  const client = createServiceRoleClient()

  const { data, error } = await client
    .from('usuario')
    .select('id, username, display_name, created_at')
    .eq('username', username.toLowerCase())
    .maybeSingle()
  if (error) throw new Error(`getPerfilPublico: ${error.message}`)
  if (!data) return null

  const [seguidas, valoraciones, resenasPublicas, listasPublicas] = await Promise.all([
    (async () => {
      const { data: filas, error } = await seguidasQuery(client, data.id)
      if (error) throw new Error(`getPerfilPublico: ${error.message}`)
      return (filas ?? []).filter(conSerieSeguida).map((fila) => ({
        created_at: fila.created_at,
        serie: fila.serie
      }))
    })(),
    (async () => {
      const { data: filas, error } = await valoracionesQuery(client, data.id)
      if (error) throw new Error(`getPerfilPublico: ${error.message}`)
      return (filas ?? []).filter(conSerieValoracion).map((fila) => ({
        nota: fila.nota,
        created_at: fila.created_at,
        serie: fila.serie
      }))
    })(),
    (async () => {
      const { data: filas, error } = await resenasQuery(client, data.id)
      if (error) throw new Error(`getPerfilPublico: ${error.message}`)
      return (filas ?? []).filter(conSerieReseña).map((fila) => ({
        id: fila.id,
        contenido: fila.contenido,
        created_at: fila.created_at,
        serie: fila.serie
      }))
    })(),
    listasPublicasDe(client, data.id)
  ])

  return {
    usuario: { username: data.username, display_name: data.display_name, created_at: data.created_at },
    seguidas,
    valoraciones,
    resenasPublicas,
    listasPublicas
  }
}