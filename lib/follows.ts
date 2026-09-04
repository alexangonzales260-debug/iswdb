import type { AuthClient } from './auth'

// F018 · Seguimiento de series (follow/unfollow): servicios inyectables.
// Mismo patrón que lib/valoraciones.ts (F009) y lib/listas.ts (F013): todas
// las funciones reciben el cliente por parámetro (las Server Actions pasan
// createAuthClient(); los tests, clientes planos con sesión en memoria). El
// RLS de usuario_serie (M11, usuario_id = auth.uid()) garantiza el alcance.

export interface SerieSeguida {
  created_at: string
  serie: { titulo: string; slug: string; portada_url: string | null }
}

// Seguir una serie (FOL-01). El RLS (usuario_serie_insert_own) exige que el
// usuario_id coincida con la sesión del cliente. Si el UNIQUE
// (usuario_id, serie_id) se viola (23505) se trata como éxito idempotente
// (FOL-08): ya estaba siguiendo la serie, y no se lanza error.
export async function seguirSerie(
  client: AuthClient,
  userId: string,
  serieId: string
): Promise<void> {
  const { error } = await client
    .from('usuario_serie')
    .insert({ usuario_id: userId, serie_id: serieId })
  if (error && error.code !== '23505') throw new Error(error.message)
}

// Dejar de seguir una serie (FOL-02). Idempotente: borrar 0 filas (la serie
// no estaba seguida, o el follow ya no existe) no es un error.
export async function dejarDeSeguirSerie(
  client: AuthClient,
  userId: string,
  serieId: string
): Promise<void> {
  const { error } = await client
    .from('usuario_serie')
    .delete()
    .eq('usuario_id', userId)
    .eq('serie_id', serieId)
  if (error) throw new Error(error.message)
}

// Indica si el usuario sigue la serie (FOL-05): select count(*) → boolean.
export async function estaSiguiendo(
  client: AuthClient,
  userId: string,
  serieId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('usuario_serie')
    .select('serie_id')
    .eq('usuario_id', userId)
    .eq('serie_id', serieId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data !== null
}

// Consulta base de "mis seguidas" (patrón lib/valoraciones.ts): el joined
// serie viene tipado por PostgREST como nullable, así que se deriva el tipo
// de fila de la propia query para filtrar los null por defensa.
function misSeguidasQuery(client: AuthClient, userId: string) {
  return client
    .from('usuario_serie')
    .select('created_at, serie ( titulo, slug, portada_url )')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: false })
}

type SeguidaRow = NonNullable<Awaited<ReturnType<typeof misSeguidasQuery>>['data']>[number]

// La FK serie_id es NOT NULL, pero PostgREST tipa el embed como nullable;
// se filtran los null por defensa (patrón lib/valoraciones.ts).
function conSerie(
  fila: SeguidaRow
): fila is SeguidaRow & { serie: { titulo: string; slug: string; portada_url: string | null } } {
  return fila.serie !== null
}

// Series seguidas por el usuario (/perfil/seguidas, FOL-03): join con serie
// (titulo, slug, portada_url), más recientemente seguidas primero.
export async function listMisSeguidas(
  client: AuthClient,
  userId: string
): Promise<SerieSeguida[]> {
  const { data, error } = await misSeguidasQuery(client, userId)
  if (error) throw new Error(`listMisSeguidas: ${error.message}`)
  return (data ?? []).filter(conSerie).map((fila) => ({
    created_at: fila.created_at,
    serie: fila.serie
  }))
}
