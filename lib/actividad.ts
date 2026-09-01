import type { AuthClient } from './auth'

export interface MiValoracion {
  nota: number
  created_at: string
  serie: { titulo: string; slug: string; portada_url: string | null; categoria: { nombre: string } | null }
}

export interface MiReseña {
  id: string
  contenido: string
  created_at: string
  serie: { titulo: string; slug: string }
}

export interface MiLista {
  id: string
  nombre: string
  descripcion: string | null
  es_publica: boolean
  updated_at: string
  numSeries: number
}

export interface MiPropuesta {
  id: string
  titulo: string
  moderation_status: 'pendiente' | 'aprobada' | 'rechazada'
  created_at: string
  slug: string | null
}

export interface AgregadosActividad {
  totalValoraciones: number
  promedioDado: number | null
  totalReseñas: number
  totalListas: number
  totalPropuestas: number
}

async function listMisValoracionesQuery(client: AuthClient, userId: string) {
  return client
    .from('valoracion')
    .select('nota, created_at, serie ( titulo, slug, portada_url, categoria ( nombre ) )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}

type ValoracionFila = NonNullable<Awaited<ReturnType<typeof listMisValoracionesQuery>>['data']>[number]

function conSerie(
  fila: ValoracionFila
): fila is ValoracionFila & { serie: { titulo: string; slug: string; portada_url: string | null; categoria: { nombre: string } | null } } {
  return fila.serie !== null
}

export async function listMisValoraciones(client: AuthClient, userId: string): Promise<MiValoracion[]> {
  const { data, error } = await listMisValoracionesQuery(client, userId)
  if (error) throw new Error(`listMisValoraciones: ${error.message}`)
  return (data ?? []).filter(conSerie).map((fila) => ({
    nota: fila.nota,
    created_at: fila.created_at,
    serie: fila.serie
  }))
}

async function listMisReseñasQuery(client: AuthClient, userId: string) {
  return client
    .from('reseña')
    .select('id, contenido, created_at, serie ( titulo, slug )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}

type ReseñaFila = NonNullable<Awaited<ReturnType<typeof listMisReseñasQuery>>['data']>[number]

function conSerieReseña(
  fila: ReseñaFila
): fila is ReseñaFila & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

export async function listMisReseñas(client: AuthClient, userId: string): Promise<MiReseña[]> {
  const { data, error } = await listMisReseñasQuery(client, userId)
  if (error) throw new Error(`listMisReseñas: ${error.message}`)
  return (data ?? []).filter(conSerieReseña).map((fila) => ({
    id: fila.id,
    contenido: fila.contenido,
    created_at: fila.created_at,
    serie: fila.serie
  }))
}

async function listMisPropuestasQuery(client: AuthClient, userId: string) {
  return client
    .from('serie')
    .select('id, titulo, moderation_status, created_at, slug')
    .eq('user_id', userId)
    .in('moderation_status', ['pendiente', 'aprobada', 'rechazada'])
    .order('created_at', { ascending: false })
}

export async function listMisPropuestas(client: AuthClient, userId: string): Promise<MiPropuesta[]> {
  const { data, error } = await listMisPropuestasQuery(client, userId)
  if (error) throw new Error(`listMisPropuestas: ${error.message}`)
  return (data ?? []).map((fila) => ({
    id: fila.id,
    titulo: fila.titulo,
    moderation_status: fila.moderation_status as 'pendiente' | 'aprobada' | 'rechazada',
    created_at: fila.created_at,
    slug: fila.moderation_status === 'aprobada' ? fila.slug : null
  }))
}

export function calcularAgregados(
  valoraciones: MiValoracion[],
  reseñas: MiReseña[],
  listas: MiLista[],
  propuestas: MiPropuesta[]
): AgregadosActividad {
  const totalValoraciones = valoraciones.length
  const promedioDado = totalValoraciones > 0
    ? Math.round((valoraciones.reduce((a, b) => a + b.nota, 0) / totalValoraciones) * 10) / 10
    : null
  const totalReseñas = reseñas.length
  const totalListas = listas.length
  const totalPropuestas = propuestas.length

  return {
    totalValoraciones,
    promedioDado,
    totalReseñas,
    totalListas,
    totalPropuestas
  }
}