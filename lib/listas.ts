import { z } from 'zod'
import type { AuthClient } from './auth'
import { supabaseServer } from './supabase'

// ── F013 · Listas personalizadas: servicios inyectables ────────────────────
// Mismo patrón que lib/valoraciones.ts (F009): las escrituras reciben el
// cliente con sesión por parámetro (las Server Actions pasan
// createAuthClient(); los tests, clientes planos con sesión en memoria) y el
// RLS de lista/lista_serie (M9) garantiza además el alcance de cada operación.
// Los servicios de lectura que necesitan ver listas privadas propias
// (listMisListas, getLista) reciben también el cliente de sesión; getListaPublica
// usa el cliente anon (solo lectura pública, LIS-07).

export const ERRORES_LISTA = {
  sinSesion: 'Debes iniciar sesión para gestionar listas',
  nombreInvalido: 'El nombre debe tener entre 3 y 100 caracteres',
  listaNoEncontrada: 'Lista no encontrada',
  sinPermiso: 'No tienes permiso para modificar esta lista',
  serieNoEncontrada: 'Serie no encontrada',
  serieNoAprobada: 'Esta serie no admite añadirse a listas',
  yaEnLaLista: 'Ya está en la lista',
  ordenInvalido: 'El orden de series no es válido'
} as const

// LIS-01: nombre requerido, trim 3-100. es_publica y descripcion opcionales;
// el nombre se valida trimeado y se almacena ya trimeado (igual que reseñas).
const listaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, ERRORES_LISTA.nombreInvalido)
    .max(100, ERRORES_LISTA.nombreInvalido),
  es_publica: z.boolean().optional(),
  descripcion: z.string().trim().optional()
})

export interface CrearListaDatos {
  nombre: string
  es_publica?: boolean
  descripcion?: string | null
}

// Usuario de la sesión del cliente inyectado; lanza si no hay sesión
// (equivalente a requireUser pero en la capa de servicio, patrón F009).
async function usuarioDeSesion(client: AuthClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error(ERRORES_LISTA.sinSesion)
  return data.user.id
}

// La lista por id: devuelve null si no accesible. Se usa con el cliente de
// sesión para que el RLS (lista_select_own_or_public) deje ver la propia
// privada además de las públicas.
async function listaPorId(client: AuthClient, id: string) {
  const { data, error } = await client
    .from('lista')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Crear una lista (LIS-01): validación Zod → sesión → insert con es_publica
// explícito (false por defecto, aunque el DB ya lo tiene) para claridad.
export async function crearLista(
  client: AuthClient,
  datos: CrearListaDatos
): Promise<{ id: string }> {
  const parsed = listaSchema.safeParse(datos)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_LISTA.nombreInvalido)
  }

  const userId = await usuarioDeSesion(client)

  const { data, error } = await client
    .from('lista')
    .insert({
      user_id: userId,
      nombre: parsed.data.nombre,
      es_publica: parsed.data.es_publica ?? false,
      descripcion: parsed.data.descripcion ?? null
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

// Renombrar una lista propia (LIS-02): update por id + user_id; 0 filas
// (inexistente, ajena o denegado por RLS) → error mapeado.
export async function renombrarLista(
  client: AuthClient,
  id: string,
  nombre: string
): Promise<void> {
  const parsed = listaSchema.pick({ nombre: true }).safeParse({ nombre })
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_LISTA.nombreInvalido)
  }

  const userId = await usuarioDeSesion(client)

  const { data, error } = await client
    .from('lista')
    .update({ nombre: parsed.data.nombre })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_LISTA.listaNoEncontrada)
}

// Eliminar una lista propia (LIS-03): delete por id + user_id; el cascade de
// las FKs borra su lista_serie. 0 filas → error mapeado.
export async function eliminarLista(client: AuthClient, id: string): Promise<void> {
  const userId = await usuarioDeSesion(client)

  const { data, error } = await client
    .from('lista')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_LISTA.listaNoEncontrada)
}

// La posición siguiente disponible es 1 + MAX(posicion) de la lista (LIS-04).
async function siguientePosicion(client: AuthClient, listaId: string): Promise<number> {
  const { data, error } = await client
    .from('lista_serie')
    .select('posicion')
    .eq('lista_id', listaId)
    .order('posicion', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.posicion ?? 0) + 1
}

// Añadir una serie a una lista propia (LIS-04): sesión + owner → la serie
// existe y está aprobada (rechazo server-side, patrón VAL-07/RES-01) →
// posición = 1 + MAX → insert. El UNIQUE(lista_id, serie_id) mapea 23505 a
// un error amigable por si la serie ya estaba (carrera o llamada directa).
export async function añadirSerieALista(
  client: AuthClient,
  listaId: string,
  serieId: string
): Promise<void> {
  const userId = await usuarioDeSesion(client)

  const lista = await listaPorId(client, listaId)
  if (!lista || lista.user_id !== userId) throw new Error(ERRORES_LISTA.sinPermiso)

  // serie_select_public (M8/F011) deja a authenticated leer todas las series;
  // se filtra el estado de moderación explícitamente para rechazar las no
  // aprobadas (LIS-04).
  const { data: serie, error: errorSerie } = await client
    .from('serie')
    .select('id, moderation_status')
    .eq('id', serieId)
    .maybeSingle()
  if (errorSerie) throw new Error(errorSerie.message)
  if (!serie) throw new Error(ERRORES_LISTA.serieNoEncontrada)
  if (serie.moderation_status !== 'aprobada') throw new Error(ERRORES_LISTA.serieNoAprobada)

  const posicion = await siguientePosicion(client, listaId)

  const { error } = await client
    .from('lista_serie')
    .insert({ lista_id: listaId, serie_id: serieId, posicion })
  if (error) {
    if (error.code === '23505') throw new Error(ERRORES_LISTA.yaEnLaLista)
    throw new Error(error.message)
  }
}

// Quitar una serie de una lista propia (LIS-05): delete por lista_id +
// serie_id; 0 filas (la serie no estaba en la lista) → error mapeado.
export async function quitarSerieDeLista(
  client: AuthClient,
  listaId: string,
  serieId: string
): Promise<void> {
  const userId = await usuarioDeSesion(client)

  const lista = await listaPorId(client, listaId)
  if (!lista || lista.user_id !== userId) throw new Error(ERRORES_LISTA.sinPermiso)

  const { data, error } = await client
    .from('lista_serie')
    .delete()
    .eq('lista_id', listaId)
    .eq('serie_id', serieId)
    .select('serie_id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_LISTA.serieNoEncontrada)
}

// Reordenar una lista propia (LIS-06): el array de serieIds debe contener
// EXACTAMENTE las series actuales (mismas filas, sin duplicados, sin faltar ni
// sobrar); se valida el conjunto antes de actualizar la posición por fila.
export async function reordenarLista(
  client: AuthClient,
  listaId: string,
  serieIds: string[]
): Promise<void> {
  const userId = await usuarioDeSesion(client)

  const actuales = await seriesActuales(client, listaId)

  const setActual = new Set(actuales)
  const setNuevo = new Set(serieIds)

  // Mismo conjunto: misma longitud, sin duplicados en el nuevo y todos nuevos
  // en el actual (la igualdad de longitud ya descarta huecos/sobras).
  const valido =
    serieIds.length === setNuevo.size &&
    serieIds.length === actuales.length &&
    serieIds.every((s) => setActual.has(s))
  if (!valido) throw new Error(ERRORES_LISTA.ordenInvalido)

  // Verificación explícita de propiedad: la lectura de lista_serie es
  // own_or_public, así que de una lista pública ajena se leerían las series
  // pero no se podría reordenar (lista_update_own / lista_serie_update_own).
  const lista = await listaPorId(client, listaId)
  if (!lista || lista.user_id !== userId) throw new Error(ERRORES_LISTA.sinPermiso)

  for (let i = 0; i < serieIds.length; i++) {
    const { error } = await client
      .from('lista_serie')
      .update({ posicion: i + 1 })
      .eq('lista_id', listaId)
      .eq('serie_id', serieIds[i])
    if (error) throw new Error(error.message)
  }
}

// Series actuales de la lista en cualquier orden (para validar el conjunto en
// reordenarLista).
async function seriesActuales(client: AuthClient, listaId: string): Promise<string[]> {
  const { data, error } = await client.from('lista_serie').select('serie_id').eq('lista_id', listaId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((fila) => fila.serie_id)
}

// ── F013 · Lecturas ────────────────────────────────────────────────────────

export interface MisLista {
  id: string
  nombre: string
  descripcion: string | null
  es_publica: boolean
  updated_at: string
  numSeries: number
}

// Grid de mis listas (/listas, LIS-09) con nº de series. Se usa el cliente de
// sesión para que el RLS deje ver también las listas privadas propias.
export async function listMisListas(
  client: AuthClient,
  userId: string
): Promise<MisLista[]> {
  const { data, error } = await client
    .from('lista')
    .select('id, nombre, descripcion, es_publica, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listMisListas: ${error.message}`)

  const listas = data ?? []
  if (listas.length === 0) return []

  const { data: conteos, error: errorConteos } = await client
    .from('lista_serie')
    .select('lista_id')
    .in('lista_id', listas.map((l) => l.id))
  if (errorConteos) throw new Error(`listMisListas: ${errorConteos.message}`)

  const numSeries = new Map<string, number>()
  for (const fila of conteos ?? []) {
    numSeries.set(fila.lista_id, (numSeries.get(fila.lista_id) ?? 0) + 1)
  }

  return listas.map((l) => ({ ...l, numSeries: numSeries.get(l.id) ?? 0 }))
}

export interface ListaSerieDetalle {
  serieId: string
  titulo: string
  slug: string
}

export interface ListaConSeries {
  id: string
  nombre: string
  descripcion: string | null
  es_publica: boolean
  user_id: string
  series: ListaSerieDetalle[]
}

export interface ListaDetalle {
  lista: ListaConSeries
  esOwner: boolean
}

// Detecta si una fila de lista_serie trae la serie embebida (defensa ante el
// tipado nullable de PostgREST, patrón lib/valoraciones.ts).
function conSerie(
  fila: {
    serie_id: string
    serie: { titulo: string; slug: string } | null
  }
): fila is { serie_id: string; serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

// Detalle de una lista (LIS-07/LIS-08): devuelve la lista y si esOwner si el
// cliente puede leerla (propia o pública); null si no accesible (privada
// ajena o inexistente → 404). userId es el id del usuario de sesión actual o
// null para lecturas anónimas; se usa solo para calcular esOwner.
export async function getLista(
  client: AuthClient,
  id: string,
  userId: string | null
): Promise<ListaDetalle | null> {
  const { data, error } = await client
    .from('lista')
    .select('id, nombre, descripcion, es_publica, user_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getLista: ${error.message}`)
  if (!data) return null

  const { data: serieFilas, error: errorSeries } = await client
    .from('lista_serie')
    .select('serie_id, posicion, serie ( titulo, slug )')
    .eq('lista_id', id)
    .order('posicion', { ascending: true })
  if (errorSeries) throw new Error(`getLista: ${errorSeries.message}`)

  const series = (serieFilas ?? []).filter(conSerie).map((fila) => ({
    serieId: fila.serie_id,
    titulo: fila.serie.titulo,
    slug: fila.serie.slug
  }))

  return {
    lista: {
      id: data.id,
      nombre: data.nombre,
      descripcion: data.descripcion,
      es_publica: data.es_publica,
      user_id: data.user_id,
      series
    },
    esOwner: userId !== null && data.user_id === userId
  }
}

// Versión de solo lectura anónima (LIS-07): subconjunto de getLista sin
// esOwner, usando el cliente anon (el RLS devuelve solo listas públicas).
export async function getListaPublica(id: string): Promise<ListaConSeries | null> {
  const detalle = await getLista(supabaseServer, id, null)
  return detalle ? detalle.lista : null
}
