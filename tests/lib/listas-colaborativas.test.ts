import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import {
  cambiarRolColaborador,
  ERRORES_COLABORADOR,
  invitarColaborador,
  listColaboradores,
  puedeEditarLista,
  puedeVerLista,
  quitarColaborador,
  type RolColaborador,
} from '@/lib/listas-colaborativas'
import {
  cambiarDescripcionLista,
  crearLista,
  ERRORES_LISTA,
  getLista,
  renombrarLista,
} from '@/lib/listas'
import { createServiceRoleClient } from '@/lib/supabase'
import {
  createTestUser,
  db,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail,
} from '../db/env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let ownerId: string
let editorId: string
let lectorId: string
let ajenoId: string
let usernameOwner: string
let usernameEditor: string
let usernameLector: string
let usernameAjeno: string
let clientOwner: SupabaseClient<Database>
let clientEditor: SupabaseClient<Database>
let clientLector: SupabaseClient<Database>
let clientAjeno: SupabaseClient<Database>
let serviceRole: SupabaseClient<Database>

let categoriaId: string | null = null
let serieAId: string | null = null

function emailDe(nombre: string): string {
  return `col-lib-${nombre}-${runId}@iswdb.local`
}

function slugDe(n: number): string {
  return `col-lib-${String(n).padStart(2, '0')}-${runId}`
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) }),
  )
  return userId
}

async function usernameDe(userId: string): Promise<string> {
  const fila = await unwrap(
    dbAdmin.from('usuario').select('username').eq('id', userId).single(),
  )
  return fila.username
}

beforeAll(async () => {
  await unwrap(dbAdmin.from('lista_serie').delete().not('lista_id', 'is', null))
  await unwrap(dbAdmin.from('lista_colaborador').delete().not('lista_id', 'is', null))
  await unwrap(dbAdmin.from('lista').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('reseña').delete().not('id', 'is', null))

  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  ownerId = await crearUsuario('owner')
  editorId = await crearUsuario('editor')
  lectorId = await crearUsuario('lector')
  ajenoId = await crearUsuario('ajeno')
  usernameOwner = await usernameDe(ownerId)
  usernameEditor = await usernameDe(editorId)
  usernameLector = await usernameDe(lectorId)
  usernameAjeno = await usernameDe(ajenoId)

  clientOwner = await signInTestUser(emailDe('owner'), TEST_PASSWORD)
  clientEditor = await signInTestUser(emailDe('editor'), TEST_PASSWORD)
  clientLector = await signInTestUser(emailDe('lector'), TEST_PASSWORD)
  clientAjeno = await signInTestUser(emailDe('ajeno'), TEST_PASSWORD)

  serviceRole = createServiceRoleClient()

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Col Lib Cat ${runId}`, slug: slugDe(99) })
      .select('id')
      .single(),
  )
  categoriaId = categoria.id

  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Col Lib A',
        slug: slugDe(1),
        categoria_id: categoria.id,
        moderation_status: 'aprobada',
      })
      .select('id')
      .single(),
  )
  serieAId = serie.id
}, 120_000)

afterAll(async () => {
  if (categoriaId !== null && serieAId !== null) {
    await unwrap(dbAdmin.from('serie').delete().like('slug', `col-lib-%${runId}`))
    await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  }
  await unwrap(dbAdmin.from('lista_colaborador').delete().in('usuario_id', createdAuthUserIds))
  await unwrap(dbAdmin.from('lista').delete().in('user_id', createdAuthUserIds))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

async function listaPrivadaPropia(): Promise<string> {
  const { id } = await crearLista(clientOwner, { nombre: `Privada ${runId}-${Date.now()}` })
  return id
}

describe('invitarColaborador (COL-01/05/06)', () => {
  it('dueño invita por username con rol editor → fila con rol e invitado_por', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id, rol, invitado_por')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single(),
      )
      expect(fila.rol).toBe('editor')
      expect(fila.invitado_por).toBe(ownerId)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('duplicado (23505) → yaEsColaborador amigable', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await expect(
        invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'lector'),
      ).rejects.toThrow(ERRORES_COLABORADOR.yaEsColaborador)
      const filas = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId),
      )
      expect(filas).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('rol inválido → rolInvalido (Zod)', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(
        invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'admin' as RolColaborador),
      ).rejects.toThrow(ERRORES_COLABORADOR.rolInvalido)
      const filas = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId),
      )
      expect(filas).toHaveLength(0)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('username inexistente → usuarioNoEncontrado', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(
        invitarColaborador(clientOwner, listaId, ownerId, `no-existe-${runId}`, 'lector'),
      ).rejects.toThrow(ERRORES_COLABORADOR.usuarioNoEncontrado)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('self-invite del dueño → noPuedeInvitarse', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(
        invitarColaborador(clientOwner, listaId, ownerId, usernameOwner, 'editor'),
      ).rejects.toThrow(ERRORES_COLABORADOR.noPuedeInvitarse)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('no dueño (ajeno o editor) → soloDueno', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(
        invitarColaborador(clientEditor, listaId, editorId, usernameAjeno, 'editor'),
      ).rejects.toThrow(ERRORES_COLABORADOR.soloDueno)
      await expect(
        invitarColaborador(clientAjeno, listaId, ajenoId, usernameLector, 'lector'),
      ).rejects.toThrow(ERRORES_COLABORADOR.soloDueno)
      const filas = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id')
          .eq('lista_id', listaId)
          .not('usuario_id', 'eq', ownerId),
      )
      expect(filas).toHaveLength(0)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})

describe('quitarColaborador (COL-04)', () => {
  it('dueño quita a un colaborador → fila borrada', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await quitarColaborador(clientOwner, listaId, ownerId, editorId)
      const filas = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId),
      )
      expect(filas).toHaveLength(0)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('no dueño (editor) → soloDueno', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await invitarColaborador(clientOwner, listaId, ownerId, usernameLector, 'lector')
      await expect(quitarColaborador(clientEditor, listaId, editorId, lectorId)).rejects.toThrow(
        ERRORES_COLABORADOR.soloDueno,
      )
      const filas = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id')
          .eq('lista_id', listaId)
          .eq('usuario_id', lectorId),
      )
      expect(filas).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('no colaborador → noEsColaborador', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(quitarColaborador(clientOwner, listaId, ownerId, ajenoId)).rejects.toThrow(
        ERRORES_COLABORADOR.noEsColaborador,
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('dueño no puede quitarse a sí mismo → noPuedeQuitarDueno', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(quitarColaborador(clientOwner, listaId, ownerId, ownerId)).rejects.toThrow(
        ERRORES_COLABORADOR.noPuedeQuitarDueno,
      )
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('usuario_id')
          .eq('lista_id', listaId)
          .eq('usuario_id', ownerId),
      )
      expect(fila).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})

describe('cambiarRolColaborador (COL-04)', () => {
  it('dueño cambia rol editor → lector → DB actualizado', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await cambiarRolColaborador(clientOwner, listaId, ownerId, editorId, 'lector')
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single(),
      )
      expect(fila.rol).toBe('lector')
      await cambiarRolColaborador(clientOwner, listaId, ownerId, editorId, 'editor')
      const restaurada = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single(),
      )
      expect(restaurada.rol).toBe('editor')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('no dueño → soloDueno', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await invitarColaborador(clientOwner, listaId, ownerId, usernameLector, 'lector')
      await expect(cambiarRolColaborador(clientEditor, listaId, editorId, lectorId, 'editor')).rejects.toThrow(
        ERRORES_COLABORADOR.soloDueno,
      )
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', lectorId)
          .single(),
      )
      expect(fila.rol).toBe('lector')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('fila del dueño protegida → noPuedeQuitarDueno', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(cambiarRolColaborador(clientOwner, listaId, ownerId, ownerId, 'lector')).rejects.toThrow(
        ERRORES_COLABORADOR.noPuedeQuitarDueno,
      )
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', ownerId)
          .single(),
      )
      expect(fila.rol).toBe('editor')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('rol inválido → rolInvalido', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await expect(
        cambiarRolColaborador(clientOwner, listaId, ownerId, editorId, 'admin' as RolColaborador),
      ).rejects.toThrow(ERRORES_COLABORADOR.rolInvalido)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('colaborador inexistente → noEsColaborador', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await expect(cambiarRolColaborador(clientOwner, listaId, ownerId, ajenoId, 'lector')).rejects.toThrow(
        ERRORES_COLABORADOR.noEsColaborador,
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})

describe('listColaboradores (sin email, orden por created_at asc)', () => {
  it('devuelve colaboradores en orden de invitación, sin email, con invitadoPor', async () => {
    const listaId = await listaPrivadaPropia()
    try {
      await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
      await invitarColaborador(clientOwner, listaId, ownerId, usernameLector, 'lector')

      await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .update({ created_at: '2026-01-03T00:00:00+00' })
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId),
      )
      await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .update({ created_at: '2026-01-04T00:00:00+00' })
          .eq('lista_id', listaId)
          .eq('usuario_id', lectorId),
      )
      await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .update({ created_at: '2026-01-02T00:00:00+00' })
          .eq('lista_id', listaId)
          .eq('usuario_id', ownerId),
      )

      const colaboradores = await listColaboradores(serviceRole, listaId)
      expect(colaboradores).toHaveLength(3)
      expect(colaboradores.map((c) => c.usuarioId)).toEqual([ownerId, editorId, lectorId])
      expect(colaboradores.map((c) => c.rol)).toEqual(['editor', 'editor', 'lector'])
      expect(colaboradores[0]).toMatchObject({ username: usernameOwner, invitadoPor: null })
      expect(colaboradores[1]).toMatchObject({ username: usernameEditor, invitadoPor: ownerId })
      expect(colaboradores[2]).toMatchObject({ username: usernameLector, invitadoPor: ownerId })
      for (const c of colaboradores) {
        expect(c).not.toHaveProperty('email')
        expect(typeof c.username).toBe('string')
        expect(typeof c.usuarioId).toBe('string')
        expect(typeof c.createdAt).toBe('string')
      }
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('lista inexistente → []', async () => {
    const filas = await listColaboradores(serviceRole, crypto.randomUUID())
    expect(filas).toHaveLength(0)
  }, 30_000)
})

describe('puedeEditarLista / puedeVerLista', () => {
  async function listaConEditorYLector(): Promise<string> {
    const listaId = await listaPrivadaPropia()
    await invitarColaborador(clientOwner, listaId, ownerId, usernameEditor, 'editor')
    await invitarColaborador(clientOwner, listaId, ownerId, usernameLector, 'lector')
    return listaId
  }

  it('dueño: puedeEditar true, puedeVer true (lista privada)', async () => {
    const listaId = await listaConEditorYLector()
    try {
      expect(await puedeEditarLista(serviceRole, listaId, ownerId)).toBe(true)
      expect(await puedeVerLista(serviceRole, listaId, ownerId)).toBe(true)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('editor: puedeEditar true, puedeVer true', async () => {
    const listaId = await listaConEditorYLector()
    try {
      expect(await puedeEditarLista(serviceRole, listaId, editorId)).toBe(true)
      expect(await puedeVerLista(serviceRole, listaId, editorId)).toBe(true)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('lector: puedeEditar false, puedeVer true', async () => {
    const listaId = await listaConEditorYLector()
    try {
      expect(await puedeEditarLista(serviceRole, listaId, lectorId)).toBe(false)
      expect(await puedeVerLista(serviceRole, listaId, lectorId)).toBe(true)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('ajeno: puedeEditar false, puedeVer false (privada)', async () => {
    const listaId = await listaConEditorYLector()
    try {
      expect(await puedeEditarLista(serviceRole, listaId, ajenoId)).toBe(false)
      expect(await puedeVerLista(serviceRole, listaId, ajenoId)).toBe(false)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('lista pública: ajeno puedeVer true, puedeEditar false', async () => {
    const { id: listaId } = await crearLista(clientOwner, {
      nombre: `Pública ${runId}-${Date.now()}`,
      es_publica: true,
    })
    try {
      expect(await puedeEditarLista(serviceRole, listaId, ajenoId)).toBe(false)
      expect(await puedeVerLista(serviceRole, listaId, ajenoId)).toBe(true)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('lista inexistente: puedeEditar false, puedeVer false', async () => {
    const inexistente = crypto.randomUUID()
    expect(await puedeEditarLista(serviceRole, inexistente, ajenoId)).toBe(false)
    expect(await puedeVerLista(serviceRole, inexistente, ajenoId)).toBe(false)
  }, 30_000)
})

describe('crearLista con fila del dueño', () => {
  it('crea la fila del dueño (rol editor, invitado_por null)', async () => {
    const { id } = await crearLista(clientOwner, {
      nombre: `Crear Fila Dueño ${runId}-${Date.now()}`,
    })
    try {
      const filas = await unwrap(
        dbAdmin.from('lista_colaborador').select('usuario_id, rol, invitado_por').eq('lista_id', id),
      )
      expect(filas).toHaveLength(1)
      expect(filas[0]).toEqual({ usuario_id: ownerId, rol: 'editor', invitado_por: null })
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('rollback app-side: si falla la fila del dueño → borra la lista', async () => {
    const nombre = `Rollback ${runId}-${Date.now()}`
    const fromOriginal = clientOwner.from.bind(clientOwner)
    const spy = vi.spyOn(clientOwner, 'from').mockImplementation((tabla, ...rest) => {
      if (tabla === 'lista_colaborador') {
        return {
          insert: async () => ({
            data: null,
            error: { message: 'fallo inserción colaborador', code: 'P0001' },
          }),
        } as never
      }
      return fromOriginal(tabla, ...rest) as never
    })
    try {
      await expect(crearLista(clientOwner, { nombre })).rejects.toThrow('fallo inserción colaborador')
      const restantes = await unwrap(dbAdmin.from('lista').select('id').eq('nombre', nombre))
      expect(restantes).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  }, 30_000)
})

describe('getLista con rol (COL-07)', () => {
  it('dueño → rol owner, esOwner true', async () => {
    const { id } = await crearLista(clientOwner, { nombre: `Rol Owner ${runId}-${Date.now()}` })
    try {
      const detalle = await getLista(clientOwner, id, ownerId)
      expect(detalle).not.toBeNull()
      expect(detalle!.esOwner).toBe(true)
      expect(detalle!.rol).toBe('owner')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('editor (privada) → rol editor, esOwner false, ve series (COL-03)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: `Rol Editor ${runId}-${Date.now()}` })
    try {
      if (serieAId !== null) {
        await unwrap(
          dbAdmin.from('lista_serie').insert({ lista_id: id, serie_id: serieAId, posicion: 1 }),
        )
      }
      await invitarColaborador(clientOwner, id, ownerId, usernameEditor, 'editor')
      const detalle = await getLista(clientEditor, id, editorId)
      expect(detalle).not.toBeNull()
      expect(detalle!.esOwner).toBe(false)
      expect(detalle!.rol).toBe('editor')
      expect(detalle!.lista.series.length).toBeGreaterThan(0)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('lector (privada) → rol lector, esOwner false, ve series (COL-03)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: `Rol Lector ${runId}-${Date.now()}` })
    try {
      if (serieAId !== null) {
        await unwrap(
          dbAdmin.from('lista_serie').insert({ lista_id: id, serie_id: serieAId, posicion: 1 }),
        )
      }
      await invitarColaborador(clientOwner, id, ownerId, usernameLector, 'lector')
      const detalle = await getLista(clientLector, id, lectorId)
      expect(detalle).not.toBeNull()
      expect(detalle!.esOwner).toBe(false)
      expect(detalle!.rol).toBe('lector')
      expect(detalle!.lista.series.length).toBeGreaterThan(0)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('ajeno (privada) → null (404, COL-07)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: `Rol Ajeno ${runId}-${Date.now()}` })
    try {
      expect(await getLista(clientAjeno, id, ajenoId)).toBeNull()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('ajeno en lista pública → rol null, esOwner false (visible pero ajeno, LIS-07)', async () => {
    const { id } = await crearLista(clientOwner, {
      nombre: `Rol Ajeno Pública ${runId}-${Date.now()}`,
      es_publica: true,
    })
    try {
      const detalle = await getLista(clientAjeno, id, ajenoId)
      expect(detalle).not.toBeNull()
      expect(detalle!.esOwner).toBe(false)
      expect(detalle!.rol).toBeNull()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('anon en lista pública → rol null, esOwner false (solo lectura, LIS-07)', async () => {
    const { id } = await crearLista(clientOwner, {
      nombre: `Rol Anon Pública ${runId}-${Date.now()}`,
      es_publica: true,
    })
    try {
      const detalle = await getLista(db, id, null)
      expect(detalle).not.toBeNull()
      expect(detalle!.esOwner).toBe(false)
      expect(detalle!.rol).toBeNull()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('editor renombra y cambia descripción (COL-02); lector rechazado', async () => {
    const { id } = await crearLista(clientOwner, { nombre: `Editar Por Rol ${runId}-${Date.now()}` })
    try {
      await invitarColaborador(clientOwner, id, ownerId, usernameEditor, 'editor')
      await invitarColaborador(clientOwner, id, ownerId, usernameLector, 'lector')

      await renombrarLista(clientEditor, id, 'Renombrada por editor colaborador')
      await cambiarDescripcionLista(clientEditor, id, 'Descripción hecha por editor')
      const fila = await unwrap(
        dbAdmin.from('lista').select('nombre, descripcion').eq('id', id).single(),
      )
      expect(fila.nombre).toBe('Renombrada por editor colaborador')
      expect(fila.descripcion).toBe('Descripción hecha por editor')

      await expect(renombrarLista(clientLector, id, 'Hack')).rejects.toThrow(ERRORES_LISTA.sinPermiso)
      await expect(cambiarDescripcionLista(clientLector, id, 'hack')).rejects.toThrow(
        ERRORES_LISTA.sinPermiso,
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)
})