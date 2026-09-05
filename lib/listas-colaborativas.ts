import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getUsuarioIdPorUsername, type ServiceRoleClient } from './sigue-usuarios'
import { createServiceRoleClient } from './supabase'

export type RolColaborador = 'editor' | 'lector'

export interface ColaboradorLista {
  usuarioId: string
  username: string
  rol: RolColaborador
  invitadoPor: string | null
  createdAt: string
}

export const ERRORES_COLABORADOR = {
  sinSesion: 'Debes iniciar sesión para gestionar colaboradores',
  soloDueno: 'Solo el dueño de la lista puede gestionar colaboradores',
  listaNoEncontrada: 'Lista no encontrada',
  usuarioNoEncontrado: 'El usuario no existe',
  yaEsColaborador: 'El usuario ya es colaborador de esta lista',
  noEsColaborador: 'El usuario no es colaborador de esta lista',
  noPuedeInvitarse: 'No puedes invitarte a ti mismo',
  rolInvalido: 'El rol debe ser editor o lector',
  noPuedeQuitarDueno: 'No puedes quitar al dueño de la lista'
} as const

const rolSchema = z.enum(['editor', 'lector'])

export async function invitarColaborador(
  client: SupabaseClient<Database>,
  listaId: string,
  invitorId: string,
  username: string,
  rol: string
): Promise<void> {
  const parsedRol = rolSchema.safeParse(rol)
  if (!parsedRol.success) throw new Error(ERRORES_COLABORADOR.rolInvalido)

  const { data: lista, error: errorLista } = await createServiceRoleClient()
    .from('lista')
    .select('user_id')
    .eq('id', listaId)
    .maybeSingle()
  if (errorLista) throw new Error(errorLista.message)
  if (!lista) throw new Error(ERRORES_COLABORADOR.listaNoEncontrada)
  if (lista.user_id !== invitorId) throw new Error(ERRORES_COLABORADOR.soloDueno)

  const targetId = await getUsuarioIdPorUsername(createServiceRoleClient(), username)
  if (!targetId) throw new Error(ERRORES_COLABORADOR.usuarioNoEncontrado)
  if (targetId === invitorId) throw new Error(ERRORES_COLABORADOR.noPuedeInvitarse)

  const { error } = await client
    .from('lista_colaborador')
    .insert({ lista_id: listaId, usuario_id: targetId, rol: parsedRol.data, invitado_por: invitorId })
  if (error) {
    if (error.code === '23505') throw new Error(ERRORES_COLABORADOR.yaEsColaborador)
    throw new Error(error.message)
  }
}

export async function quitarColaborador(
  client: SupabaseClient<Database>,
  listaId: string,
  ownerId: string,
  colaboradorId: string
): Promise<void> {
  const { data: lista, error: errorLista } = await client
    .from('lista')
    .select('user_id')
    .eq('id', listaId)
    .maybeSingle()
  if (errorLista) throw new Error(errorLista.message)
  if (!lista) throw new Error(ERRORES_COLABORADOR.listaNoEncontrada)
  if (lista.user_id !== ownerId) throw new Error(ERRORES_COLABORADOR.soloDueno)

  if (colaboradorId === ownerId) throw new Error(ERRORES_COLABORADOR.noPuedeQuitarDueno)

  const { data, error } = await client
    .from('lista_colaborador')
    .delete()
    .eq('lista_id', listaId)
    .eq('usuario_id', colaboradorId)
    .select('usuario_id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_COLABORADOR.noEsColaborador)
}

export async function cambiarRolColaborador(
  client: SupabaseClient<Database>,
  listaId: string,
  ownerId: string,
  colaboradorId: string,
  nuevoRol: string
): Promise<void> {
  const parsedRol = rolSchema.safeParse(nuevoRol)
  if (!parsedRol.success) throw new Error(ERRORES_COLABORADOR.rolInvalido)

  const { data: lista, error: errorLista } = await client
    .from('lista')
    .select('user_id')
    .eq('id', listaId)
    .maybeSingle()
  if (errorLista) throw new Error(errorLista.message)
  if (!lista) throw new Error(ERRORES_COLABORADOR.listaNoEncontrada)
  if (lista.user_id !== ownerId) throw new Error(ERRORES_COLABORADOR.soloDueno)

  if (colaboradorId === ownerId) throw new Error(ERRORES_COLABORADOR.noPuedeQuitarDueno)

  const { data, error } = await client
    .from('lista_colaborador')
    .update({ rol: parsedRol.data })
    .eq('lista_id', listaId)
    .eq('usuario_id', colaboradorId)
    .select('usuario_id')
  if (error) throw new Error(error.message)
  if ((data ?? []).length === 0) throw new Error(ERRORES_COLABORADOR.noEsColaborador)
}

export async function listColaboradores(
  client: ServiceRoleClient,
  listaId: string
): Promise<ColaboradorLista[]> {
  const { data, error } = await client
    .from('lista_colaborador')
    .select('usuario_id, rol, invitado_por, created_at, usuario!lista_colaborador_usuario_id_fkey ( username )')
    .eq('lista_id', listaId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)

  return (data ?? []).map((fila) => ({
    usuarioId: fila.usuario_id,
    username: fila.usuario?.username ?? '',
    rol: fila.rol as RolColaborador,
    invitadoPor: fila.invitado_por,
    createdAt: fila.created_at
  }))
}

export async function puedeEditarLista(
  client: ServiceRoleClient,
  listaId: string,
  userId: string
): Promise<boolean> {
  const { data: lista, error: errorLista } = await client
    .from('lista')
    .select('user_id')
    .eq('id', listaId)
    .maybeSingle()
  if (errorLista) throw new Error(errorLista.message)
  if (!lista) return false
  if (lista.user_id === userId) return true

  const { data: colaboracion, error: errorColab } = await client
    .from('lista_colaborador')
    .select('rol')
    .eq('lista_id', listaId)
    .eq('usuario_id', userId)
    .maybeSingle()
  if (errorColab) throw new Error(errorColab.message)
  return colaboracion?.rol === 'editor'
}

export async function puedeVerLista(
  client: ServiceRoleClient,
  listaId: string,
  userId: string
): Promise<boolean> {
  const { data: lista, error: errorLista } = await client
    .from('lista')
    .select('user_id, es_publica')
    .eq('id', listaId)
    .maybeSingle()
  if (errorLista) throw new Error(errorLista.message)
  if (!lista) return false
  if (lista.user_id === userId) return true
  if (lista.es_publica) return true

  const { data: colaboracion, error: errorColab } = await client
    .from('lista_colaborador')
    .select('usuario_id')
    .eq('lista_id', listaId)
    .eq('usuario_id', userId)
    .maybeSingle()
  if (errorColab) throw new Error(errorColab.message)
  return colaboracion !== null
}