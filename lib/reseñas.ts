import { z } from 'zod'
import type { AuthClient } from './auth'

// ── F012 · Reseñas: servicios inyectables ──────────────────────────────────
// Mismo patrón que lib/valoraciones.ts (F009): las escrituras reciben el
// cliente con sesión por parámetro (las Server Actions pasan
// createAuthClient(); los tests, clientes planos con sesión en memoria) y el
// RLS de reseña (M5) garantiza además que solo se toca la fila propia.

export const ERRORES_RESEÑA = {
  sinSesion: 'Debes iniciar sesión para reseñar',
  sinValoracion: 'Debes valorar la serie antes de reseñarla',
  contenidoInvalido: 'La reseña debe tener entre 50 y 2000 caracteres',
  serieNoEncontrada: 'Serie no encontrada',
  serieNoAprobada: 'Esta serie no admite reseñas',
  duplicada: 'Ya tienes una reseña para esta serie',
  noEncontrada: 'Reseña no encontrada',
  sinPermiso: 'No tienes permiso para eliminar esta reseña'
} as const

// Texto libre 50-2000 (decisión 1 del plan): se valida el contenido trimeado
// y se almacena ya trimeado (el CHECK de la BD aplica al valor guardado).
const contenidoSchema = z
  .string()
  .trim()
  .min(50, ERRORES_RESEÑA.contenidoInvalido)
  .max(2000, ERRORES_RESEÑA.contenidoInvalido)

// Usuario de la sesión del cliente inyectado; lanza si no hay sesión
// (equivalente a requireUser pero en la capa de servicio).
async function usuarioDeSesion(client: AuthClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error(ERRORES_RESEÑA.sinSesion)
  return data.user.id
}

// La serie por slug (id + estado). serie_select_public permite leer también
// las no aprobadas: necesario para poder rechazarlas server-side.
async function seriePorSlug(client: AuthClient, slug: string) {
  const { data, error } = await client
    .from('serie')
    .select('id, moderation_status')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Crear la reseña del usuario para una serie (RES-01). Orden: validación Zod
// → sesión → resolución de la serie → rechazo si no es aprobada (coherente
// con VAL-07) → rechazo server-side si no hay valoración previa (RES-02, no
// solo UI) → insert. El RLS (reseña_insert_own) garantiza además que solo
// escribe su propia fila.
export async function crearReseña(
  client: AuthClient,
  serieSlug: string,
  contenido: string
): Promise<void> {
  const parsed = contenidoSchema.safeParse(contenido)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_RESEÑA.contenidoInvalido)
  }

  const userId = await usuarioDeSesion(client)

  const serie = await seriePorSlug(client, serieSlug)
  if (!serie) throw new Error(ERRORES_RESEÑA.serieNoEncontrada)
  if (serie.moderation_status !== 'aprobada') {
    throw new Error(ERRORES_RESEÑA.serieNoAprobada)
  }

  // RES-02: exige valoración previa. RLS no puede expresar esta regla; se
  // comprueba app-side con el mismo cliente (valoracion_select_public, D11).
  const { data: valoración, error: errorValoración } = await client
    .from('valoracion')
    .select('nota')
    .eq('serie_id', serie.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (errorValoración) throw new Error(errorValoración.message)
  if (!valoración) throw new Error(ERRORES_RESEÑA.sinValoracion)

  const { error } = await client
    .from('reseña')
    .insert({ user_id: userId, serie_id: serie.id, contenido: parsed.data })
  if (error) {
    // UNIQUE(user_id, serie_id) (RES-07): la UI pasa a modo edición cuando ya
    // hay reseña, pero una carrera o llamada directa aún puede chocar.
    if (error.code === '23505') throw new Error(ERRORES_RESEÑA.duplicada)
    throw new Error(error.message)
  }
}

// Editar la reseña propia (RES-03): update por id + user_id. Solo exige
// propiedad: no re-exige valoración (decisión 8 del plan — la reseña
// sobrevive a la retirada del voto). El trigger refresca updated_at.
export async function editarReseña(
  client: AuthClient,
  reseñaId: string,
  contenido: string
): Promise<void> {
  const parsed = contenidoSchema.safeParse(contenido)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_RESEÑA.contenidoInvalido)
  }

  const userId = await usuarioDeSesion(client)

  // reseña_update_own ya filtra por dueño en la BD; el .eq por user_id y el
  // conteo de filas devuelven un error mapeado en vez de un update vacío.
  const { data, error } = await client
    .from('reseña')
    .update({ contenido: parsed.data })
    .eq('id', reseñaId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_RESEÑA.noEncontrada)
}

// Eliminar una reseña (RES-04/RES-09): RLS reseña_delete_own_or_mod permite
// borrar la propia o cualquiera si se es mod/admin. Sin .eq por user_id:
// el rol lo decide la política. 0 filas → sin permiso (o inexistente).
// La valoración permanece intacta (RES-04): no se toca la tabla valoracion.
export async function eliminarReseña(client: AuthClient, reseñaId: string): Promise<void> {
  await usuarioDeSesion(client)

  const { data, error } = await client.from('reseña').delete().eq('id', reseñaId).select('id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_RESEÑA.sinPermiso)
}

// ── F012 · Lecturas ────────────────────────────────────────────────────────

export interface ReseñaPropia {
  id: string
  contenido: string
}

// Reseña actual del usuario para una serie (modo edición del formulario);
// null si no tiene. Lectura pública filtrada server-side (reseña_select_public).
export async function getReseñaUsuario(
  client: AuthClient,
  serieId: string,
  userId: string
): Promise<ReseñaPropia | null> {
  const { data, error } = await client
    .from('reseña')
    .select('id, contenido')
    .eq('serie_id', serieId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`getReseñaUsuario: ${error.message}`)
  return data ? { id: data.id, contenido: data.contenido } : null
}

export interface ReseñaPublica {
  id: string
  contenido: string
  created_at: string
  updated_at: string
  autor: { id: string; email: string | null }
}

function reseñasDeSerieQuery(client: AuthClient, serieId: string) {
  return client
    .from('reseña')
    .select('id, contenido, created_at, updated_at, usuario ( id, email )')
    .eq('serie_id', serieId)
    .order('created_at', { ascending: false })
}

type ReseñaFila = NonNullable<Awaited<ReturnType<typeof reseñasDeSerieQuery>>['data']>[number]

// La FK user_id es NOT NULL, pero PostgREST tipa el embed como nullable; se
// filtran los null por defensa (patrón de lib/valoraciones.ts).
function conAutor(
  fila: ReseñaFila
): fila is ReseñaFila & { usuario: { id: string; email: string | null } } {
  return fila.usuario !== null
}

// Reseñas de una serie para la ficha (RES-08): orden cronológico descendente
// con autor (id + email). IMPORTANTE: pasar un cliente service-role
// (createServiceRoleClient en lib/supabase.ts; en tests, el dbAdmin): el
// embed usuario(email) está protegido por usuario_select_authenticated y el
// cliente anon lo vería null. El email completo solo vive server-side; la UI
// lo trunca con truncarEmail (lib/format.ts).
export async function listReseñasSerie(
  clientServiceRole: AuthClient,
  serieId: string
): Promise<ReseñaPublica[]> {
  const { data, error } = await reseñasDeSerieQuery(clientServiceRole, serieId)
  if (error) throw new Error(`listReseñasSerie: ${error.message}`)
  return (data ?? []).filter(conAutor).map((fila) => ({
    id: fila.id,
    contenido: fila.contenido,
    created_at: fila.created_at,
    updated_at: fila.updated_at,
    autor: { id: fila.usuario.id, email: fila.usuario.email }
  }))
}
