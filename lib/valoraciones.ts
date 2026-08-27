import { supabaseServer } from './supabase'

// El SELECT de valoracion es público (D11: valoracion_select_public), así que
// basta el cliente anon existente filtrando por user_id server-side.
function misValoracionesQuery(userId: string) {
  return supabaseServer
    .from('valoracion')
    .select('nota, created_at, serie ( titulo, slug )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
}

type ValoracionPropiaRow = NonNullable<
  Awaited<ReturnType<typeof misValoracionesQuery>>['data']
>[number]

export interface MiValoracion {
  nota: number
  created_at: string
  serie: { titulo: string; slug: string }
}

// La FK serie_id es NOT NULL, pero PostgREST tipa el embed como nullable;
// se filtran los null por defensa (patrón de lib/series.ts).
function conSerie(
  fila: ValoracionPropiaRow
): fila is ValoracionPropiaRow & { serie: { titulo: string; slug: string } } {
  return fila.serie !== null
}

// Valoraciones del usuario para /perfil (AUTH-03): serie + nota + fecha,
// más recientes primero.
export async function listMisValoraciones(userId: string): Promise<MiValoracion[]> {
  const { data, error } = await misValoracionesQuery(userId)
  if (error) throw new Error(`listMisValoraciones: ${error.message}`)
  return (data ?? []).filter(conSerie).map((fila) => ({
    nota: fila.nota,
    created_at: fila.created_at,
    serie: fila.serie
  }))
}
