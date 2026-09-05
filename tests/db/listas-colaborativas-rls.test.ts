import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

import {
  createTestUser,
  db,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from './env'

// F024 (COL-01..07): tabla lista_colaborador (M17) y su RLS en crudo.
// M17 define lista_colaborador (lista_id → lista cascade, usuario_id → usuario
// cascade, rol CHECK editor/lector, invitado_por → usuario set null, UNIQUE
// (lista_id, usuario_id)); el RLS evita recursión mutua lista ↔ lista_
// colaborador con helpers SECURITY DEFINER (es_colaborador / es_owner).
// Policies adicionales en lista (select_collab, update_editor) y lista_serie
// (select_collab, insert/update/delete_editor) sin tocar M9; trigger
// lista_owner_fields_guard (user_id inmutable, es_publica solo dueño).
// Los servicios (lib/listas-colaborativas.ts) se cubren en T2; aquí se
// ejercitan las policies directamente con clientes anon / de sesión.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
let listaCounter = 0
const createdAuthUserIds: string[] = []

let ownerId: string
let editorId: string
let lectorId: string
let ajenoId: string
let clientOwner: SupabaseClient<Database>
let clientEditor: SupabaseClient<Database>
let clientLector: SupabaseClient<Database>
let clientAjeno: SupabaseClient<Database>

let categoriaId: string
let serieAId: string
let serieBId: string

// Lista privada del owner con filas: owner(editor), editor(editor), lector(lector).
let baseListaId: string

function slugDe(nombre: string): string {
  return `col-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `col-test-${nombre}-${runId}@iswdb.local`
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin
      .from('usuario')
      .insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

// Lista privada del dueño dado (sin filas de lista_colaborador aún).
async function crearListaPrivada(dueñoId: string): Promise<string> {
  const lista = await unwrap(
    dbAdmin
      .from('lista')
      .insert({ user_id: dueñoId, nombre: `Lista RLS ${runId}-${listaCounter++}` })
      .select('id')
      .single()
  )
  return lista.id
}

// Fila explícita en lista_colaborador vía service_role (bypass RLS).
async function invitar(dueñoId: string, listaId: string, usuarioId: string, rol: 'editor' | 'lector') {
  return unwrap(
    dbAdmin.from('lista_colaborador').insert({ lista_id: listaId, usuario_id: usuarioId, rol, invitado_por: dueñoId })
  )
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  ownerId = await crearUsuario('owner')
  editorId = await crearUsuario('editor')
  lectorId = await crearUsuario('lector')
  ajenoId = await crearUsuario('ajeno')
  clientOwner = await signInTestUser(emailDe('owner'), TEST_PASSWORD)
  clientEditor = await signInTestUser(emailDe('editor'), TEST_PASSWORD)
  clientLector = await signInTestUser(emailDe('lector'), TEST_PASSWORD)
  clientAjeno = await signInTestUser(emailDe('ajeno'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Col Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie Col A', slug: slugDe('a'), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie Col B', slug: slugDe('b'), categoria_id: categoria.id, moderation_status: 'aprobada' }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  serieBId = series.find((s) => s.slug === slugDe('b'))!.id

  baseListaId = await crearListaPrivada(ownerId)
  // Fila del dueño (rol editor, invitado_por NULL, patrón crearLista T2) +
  // editor + lector.
  await unwrap(
    dbAdmin.from('lista_colaborador').insert({ lista_id: baseListaId, usuario_id: ownerId, rol: 'editor' })
  )
  await invitar(ownerId, baseListaId, editorId, 'editor')
  await invitar(ownerId, baseListaId, lectorId, 'lector')
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('lista_colaborador').delete().eq('lista_id', baseListaId))
  await unwrap(
    dbAdmin
      .from('serie')
      .delete()
      .in('slug', [slugDe('a'), slugDe('b')])
  )
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M17 invariantes — lista_colaborador', () => {
  it('insert colaborador ok con rol, invitado_por y created_at', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await unwrap(
        dbAdmin.from('lista_colaborador').insert({
          lista_id: listaId,
          usuario_id: editorId,
          rol: 'lector',
          invitado_por: ownerId
        })
      )
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('lista_id, usuario_id, rol, invitado_por, created_at')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single()
      )
      expect(fila.rol).toBe('lector')
      expect(fila.invitado_por).toBe(ownerId)
      expect(new Date(fila.created_at).getTime()).not.toBeNaN()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('rol default editor cuando se omite', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await unwrap(
        dbAdmin.from('lista_colaborador').insert({ lista_id: listaId, usuario_id: editorId })
      )
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single()
      )
      expect(fila.rol).toBe('editor')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('duplicado (lista_id, usuario_id) → 23505 (COL-06)', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await invitar(ownerId, listaId, editorId, 'editor')
      await expect(
        unwrap(dbAdmin.from('lista_colaborador').insert({ lista_id: listaId, usuario_id: editorId, rol: 'lector' }))
      ).rejects.toThrow(/duplicate key value/i)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('CHECK rol inválido → violación de constraint (23514)', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await expect(
        unwrap(
          dbAdmin.from('lista_colaborador').insert({ lista_id: listaId, usuario_id: editorId, rol: 'admin' })
        )
      ).rejects.toThrow(/check constraint|violates check/i)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('cascade: borrar lista → colaboradores borrados', async () => {
    const listaId = await crearListaPrivada(ownerId)
    await invitar(ownerId, listaId, editorId, 'editor')
    await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    const restantes = await unwrap(
      dbAdmin.from('lista_colaborador').select('lista_id').eq('lista_id', listaId)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('cascade: borrar usuario → su fila como colaborador y como invitado_por se resuelve (set null)', async () => {
    const cscdId = await crearUsuario('cscd')
    const listaId = await crearListaPrivada(ownerId)
    try {
      // cscd como colaborador de la lista ajena (owner), y como invitador de editor.
      await invitar(ownerId, listaId, cscdId, 'lector')
      await unwrap(
        dbAdmin.from('lista_colaborador').insert({
          lista_id: listaId,
          usuario_id: editorId,
          rol: 'editor',
          invitado_por: cscdId
        })
      )
      await deleteTestUser(cscdId)
      // La fila de cscd como colaborador desaparece (usuario_id cascade).
      const filasCscd = await unwrap(
        dbAdmin.from('lista_colaborador').select('usuario_id').eq('lista_id', listaId).eq('usuario_id', cscdId)
      )
      expect(filasCscd).toHaveLength(0)
      // La fila de editor conserva invitado_por = NULL (on delete set null).
      const filaEditor = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('invitado_por')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single()
      )
      expect(filaEditor.invitado_por).toBeNull()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})

describe('M17 RLS — lista_colaborador (select_access)', () => {
  it('dueño: ve todas las filas de su lista (dueño + editor + lector)', async () => {
    const filas = await unwrap(
      clientOwner.from('lista_colaborador').select('usuario_id, rol').eq('lista_id', baseListaId)
    )
    const porUsuario = new Map(filas.map((f) => [f.usuario_id, f.rol]))
    expect(porUsuario.get(ownerId)).toBe('editor')
    expect(porUsuario.get(editorId)).toBe('editor')
    expect(porUsuario.get(lectorId)).toBe('lector')
  }, 30_000)

  it('colaborador: ve solo su propia fila', async () => {
    const filasEditor = await unwrap(
      clientEditor.from('lista_colaborador').select('usuario_id, rol').eq('lista_id', baseListaId)
    )
    expect(filasEditor).toEqual([{ usuario_id: editorId, rol: 'editor' }])

    const filasLector = await unwrap(
      clientLector.from('lista_colaborador').select('usuario_id, rol').eq('lista_id', baseListaId)
    )
    expect(filasLector).toEqual([{ usuario_id: lectorId, rol: 'lector' }])
  }, 30_000)

  it('ajeno: no ve filas de la lista ajena', async () => {
    const filas = await unwrap(
      clientAjeno.from('lista_colaborador').select('usuario_id').eq('lista_id', baseListaId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('anon: sin policy de select aplicable → 0 filas', async () => {
    // En el stack local Supabase, anon recibe grant global (roles.sql); es el
    // RLS (sin policy select para anon) quien devuelve 0 filas.
    const filas = await unwrap(
      db.from('lista_colaborador').select('usuario_id').eq('lista_id', baseListaId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)
})

describe('M17 RLS — lista (select_collab / update_editor)', () => {
  it('editor: lee la lista privada del dueño (COL-02/03)', async () => {
    const filas = await unwrap(
      clientEditor.from('lista').select('id, user_id, es_publica').eq('id', baseListaId)
    )
    expect(filas).toEqual([{ id: baseListaId, user_id: ownerId, es_publica: false }])
  }, 30_000)

  it('lector: lee la lista privada del dueño (COL-03)', async () => {
    const filas = await unwrap(
      clientLector.from('lista').select('id').eq('id', baseListaId)
    )
    expect(filas).toHaveLength(1)
  }, 30_000)

  it('ajeno: no lee la lista privada ajena (COL-07)', async () => {
    const filas = await unwrap(
      clientAjeno.from('lista').select('id').eq('id', baseListaId)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('editor: actualiza nombre y descripcion de la lista privada del dueño (COL-02)', async () => {
    await unwrap(
      clientEditor
        .from('lista')
        .update({ nombre: 'Lista renombrada por editor', descripcion: 'editada' })
        .eq('id', baseListaId)
        .select('id')
    )
    const fila = await unwrap(
      dbAdmin.from('lista').select('nombre, descripcion').eq('id', baseListaId).single()
    )
    expect(fila.nombre).toBe('Lista renombrada por editor')
    expect(fila.descripcion).toBe('editada')
    // Restaurar para no interferir con otros tests.
    await unwrap(
      dbAdmin.from('lista').update({ nombre: 'Lista RLS base', descripcion: null }).eq('id', baseListaId)
    )
  }, 30_000)

  it('lector: no puede actualizar la lista (independiente de la escritura)', async () => {
    const actualizadas = await unwrap(
      clientLector
        .from('lista')
        .update({ nombre: 'Lector hackea' })
        .eq('id', baseListaId)
        .select('id')
    )
    expect(actualizadas).toHaveLength(0)
  }, 30_000)

  it('editor: puede renombrar (update_editor) — verificación aislada sobre lista propia escenario', async () => {
    // Lista privada nueva del dueño con solo el editor invitado.
    const listaId = await crearListaPrivada(ownerId)
    try {
      await invitar(ownerId, listaId, editorId, 'editor')
      const actualizadas = await unwrap(
        clientEditor.from('lista').update({ nombre: 'Editada por editor' }).eq('id', listaId).select('id')
      )
      expect(actualizadas).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})

describe('M17 RLS — lista_serie (collab / editor)', () => {
  it('editor: inserta, lee, reordena (update) y borra series de la lista privada (COL-02)', async () => {
    const filasInsert = await unwrap(
      clientEditor.from('lista_serie').insert([
        { lista_id: baseListaId, serie_id: serieAId, posicion: 1 },
        { lista_id: baseListaId, serie_id: serieBId, posicion: 2 }
      ]).select('serie_id, posicion')
    )
    expect(filasInsert).toHaveLength(2)

    const leidas = await unwrap(
      clientEditor
        .from('lista_serie')
        .select('serie_id, posicion')
        .eq('lista_id', baseListaId)
        .order('posicion', { ascending: true })
    )
    expect(leidas).toEqual([
      { serie_id: serieAId, posicion: 1 },
      { serie_id: serieBId, posicion: 2 }
    ])

    await unwrap(
      clientEditor
        .from('lista_serie')
        .update({ posicion: 3 })
        .eq('lista_id', baseListaId)
        .eq('serie_id', serieBId)
    )
    await unwrap(
      clientEditor
        .from('lista_serie')
        .delete()
        .eq('lista_id', baseListaId)
        .eq('serie_id', serieBId)
    )
    await unwrap(
      clientOwner
        .from('lista_serie')
        .delete()
        .eq('lista_id', baseListaId)
        .eq('serie_id', serieAId)
    )
  }, 30_000)

  it('lector: lee las series de la lista privada pero no inserta (COL-03)', async () => {
    await unwrap(
      dbAdmin.from('lista_serie').insert({ lista_id: baseListaId, serie_id: serieAId, posicion: 1 })
    )
    const leidas = await unwrap(
      clientLector.from('lista_serie').select('serie_id').eq('lista_id', baseListaId)
    )
    expect(leidas).toEqual([{ serie_id: serieAId }])

    await expect(
      unwrap(
        clientLector.from('lista_serie').insert({ lista_id: baseListaId, serie_id: serieBId, posicion: 2 })
      )
    ).rejects.toThrow(/row-level security/i)
    await unwrap(
      dbAdmin.from('lista_serie').delete().eq('lista_id', baseListaId).eq('serie_id', serieAId)
    )
  }, 30_000)

  it('lector: no actualiza ni borra series de la lista privada', async () => {
    await unwrap(
      dbAdmin.from('lista_serie').insert({ lista_id: baseListaId, serie_id: serieAId, posicion: 1 })
    )
    const actualizadas = await unwrap(
      clientLector
        .from('lista_serie')
        .update({ posicion: 9 })
        .eq('lista_id', baseListaId)
        .eq('serie_id', serieAId)
        .select('serie_id')
    )
    expect(actualizadas).toHaveLength(0)

    const borradas = await unwrap(
      clientLector
        .from('lista_serie')
        .delete()
        .eq('lista_id', baseListaId)
        .eq('serie_id', serieAId)
        .select('serie_id')
    )
    expect(borradas).toHaveLength(0)
    // La fila sigue existiendo.
    const restantes = await unwrap(
      dbAdmin.from('lista_serie').select('serie_id').eq('lista_id', baseListaId).eq('serie_id', serieAId)
    )
    expect(restantes).toHaveLength(1)
    await unwrap(
      dbAdmin.from('lista_serie').delete().eq('lista_id', baseListaId).eq('serie_id', serieAId)
    )
  }, 30_000)

  it('ajeno: no lee ni escribe series de la lista privada ajena (COL-07)', async () => {
    const leidas = await unwrap(
      clientAjeno.from('lista_serie').select('serie_id').eq('lista_id', baseListaId)
    )
    expect(leidas).toHaveLength(0)

    await expect(
      unwrap(
        clientAjeno.from('lista_serie').insert({ lista_id: baseListaId, serie_id: serieAId, posicion: 1 })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('anon: no inserta series en ninguna lista', async () => {
    await expect(
      unwrap(db.from('lista_serie').insert({ lista_id: baseListaId, serie_id: serieAId, posicion: 1 }))
    ).rejects.toThrow(/row-level security|permission denied/i)
  }, 30_000)
})

describe('M17 RLS — lista_colaborador (escritura owner)', () => {
  it('dueño: invita colaborador (insert con invitado_por) y colaborador no puede invitar', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      // Dueño invita.
      await unwrap(
        clientOwner.from('lista_colaborador').insert({
          lista_id: listaId,
          usuario_id: editorId,
          rol: 'editor',
          invitado_por: ownerId
        })
      )
      // Editor ya colaborador NO puede invitar a otro (ni siquiera a sí mismo).
      await expect(
        unwrap(
          clientEditor.from('lista_colaborador').insert({
            lista_id: listaId,
            usuario_id: lectorId,
            rol: 'lector',
            invitado_por: editorId
          })
        )
      ).rejects.toThrow(/row-level security/i)
      // Ajeno tampoco puede invitar.
      await expect(
        unwrap(
          clientAjeno.from('lista_colaborador').insert({
            lista_id: listaId,
            usuario_id: lectorId,
            rol: 'lector',
            invitado_por: ajenoId
          })
        )
      ).rejects.toThrow(/row-level security/i)
      // Anon: sin policy de insert aplicable → RLS deniega.
      await expect(
        unwrap(
          db.from('lista_colaborador').insert({
            lista_id: listaId,
            usuario_id: lectorId,
            rol: 'lector'
          })
        )
      ).rejects.toThrow(/row-level security|permission denied/i)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('dueño: cambia el rol de un colaborador y lo quita; el dueño no puede quitarse', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      // Fila del dueño (rol editor, invitado_por NULL, patrón crearLista T2).
      await unwrap(
        dbAdmin.from('lista_colaborador').insert({ lista_id: listaId, usuario_id: ownerId, rol: 'editor' })
      )
      await invitar(ownerId, listaId, editorId, 'editor')
      await invitar(ownerId, listaId, lectorId, 'lector')

      // Cambio editor → lector.
      await unwrap(
        clientOwner
          .from('lista_colaborador')
          .update({ rol: 'lector' })
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .select('usuario_id')
      )
      const cambiado = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', editorId)
          .single()
      )
      expect(cambiado.rol).toBe('lector')

      // Quita a lector.
      await unwrap(
        clientOwner
          .from('lista_colaborador')
          .delete()
          .eq('lista_id', listaId)
          .eq('usuario_id', lectorId)
          .select('usuario_id')
      )
      const restantesLector = await unwrap(
        dbAdmin.from('lista_colaborador').select('usuario_id').eq('lista_id', listaId).eq('usuario_id', lectorId)
      )
      expect(restantesLector).toHaveLength(0)

      // El dueño no puede quitarse a sí mismo (delete_owner excluye su fila).
      const borradoDueno = await unwrap(
        clientOwner
          .from('lista_colaborador')
          .delete()
          .eq('lista_id', listaId)
          .eq('usuario_id', ownerId)
          .select('usuario_id')
      )
      expect(borradoDueno).toHaveLength(0)
      const sigueDueno = await unwrap(
        dbAdmin.from('lista_colaborador').select('usuario_id').eq('lista_id', listaId).eq('usuario_id', ownerId)
      )
      expect(sigueDueno).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('el dueño no puede cambiar su propia fila (update_owner excluye su fila)', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await unwrap(
        dbAdmin.from('lista_colaborador').insert({ lista_id: listaId, usuario_id: ownerId, rol: 'editor' })
      )
      const actualizadas = await unwrap(
        clientOwner
          .from('lista_colaborador')
          .update({ rol: 'lector' })
          .eq('lista_id', listaId)
          .eq('usuario_id', ownerId)
          .select('usuario_id')
      )
      expect(actualizadas).toHaveLength(0)
      const fila = await unwrap(
        dbAdmin
          .from('lista_colaborador')
          .select('rol')
          .eq('lista_id', listaId)
          .eq('usuario_id', ownerId)
          .single()
      )
      expect(fila.rol).toBe('editor')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('colaborador (editor) no puede cambiar roles ni quitar colaboradores', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await invitar(ownerId, listaId, editorId, 'editor')
      await invitar(ownerId, listaId, lectorId, 'lector')

      const cambios = await unwrap(
        clientEditor
          .from('lista_colaborador')
          .update({ rol: 'editor' })
          .eq('lista_id', listaId)
          .eq('usuario_id', lectorId)
          .select('usuario_id')
      )
      expect(cambios).toHaveLength(0)

      const borradas = await unwrap(
        clientEditor
          .from('lista_colaborador')
          .delete()
          .eq('lista_id', listaId)
          .eq('usuario_id', lectorId)
          .select('usuario_id')
      )
      expect(borradas).toHaveLength(0)
      // Lector sigue invitado.
      const restantes = await unwrap(
        dbAdmin.from('lista_colaborador').select('usuario_id').eq('lista_id', listaId).eq('usuario_id', lectorId)
      )
      expect(restantes).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})

describe('M17 trigger — lista_owner_fields_guard', () => {
  it('no-dueño (editor) no puede cambiar es_publica de la lista → trigger deniega', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await invitar(ownerId, listaId, editorId, 'editor')
      await expect(
        unwrap(
          clientEditor.from('lista').update({ es_publica: true }).eq('id', listaId).select('id')
        )
      ).rejects.toThrow(/solo el dueño puede cambiar es_publica/i)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('no-dueño (editor) no puede cambiar user_id de la lista → trigger deniega', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await invitar(ownerId, listaId, editorId, 'editor')
      await expect(
        unwrap(
          clientEditor.from('lista').update({ user_id: ajenoId }).eq('id', listaId).select('id')
        )
      ).rejects.toThrow(/user_id es inmutable/i)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)

  it('dueño: sí puede cambiar es_publica de su lista', async () => {
    const listaId = await crearListaPrivada(ownerId)
    try {
      await unwrap(clientOwner.from('lista').update({ es_publica: true }).eq('id', listaId).select('id'))
      const fila = await unwrap(dbAdmin.from('lista').select('es_publica').eq('id', listaId).single())
      expect(fila.es_publica).toBe(true)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', listaId))
    }
  }, 30_000)
})