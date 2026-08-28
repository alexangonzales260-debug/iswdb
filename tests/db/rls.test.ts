import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createTestUser,
  db,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap
} from './env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'
const createdAuthUserIds: string[] = []

let runId: number
let noRowId: string
let normalId: string
let modId: string
let adminId: string
let admin2Id: string
let clientNoRow: SupabaseClient
let clientNormal: SupabaseClient
let clientMod: SupabaseClient
let clientAdmin: SupabaseClient
let clientAdmin2: SupabaseClient
let categoriaId: string
let serieId: string
let targetCanalId: string

beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  await unwrap(dbAdmin.from('episodio').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().like('slug', 'rls-%'))
  await unwrap(dbAdmin.from('canal').delete().like('handle', 'rls-%'))
  await unwrap(dbAdmin.from('categoria').delete().like('nombre', 'cat-rls-%'))
  await unwrap(dbAdmin.from('usuario').delete().not('id', 'is', null))

  runId = Date.now()
  const emails = {
    noRow: `rls-norow-${runId}@iswdb.local`,
    normal: `rls-normal-${runId}@iswdb.local`,
    mod: `rls-mod-${runId}@iswdb.local`,
    admin: `rls-admin-${runId}@iswdb.local`,
    admin2: `rls-admin2-${runId}@iswdb.local`
  }
  noRowId = await createTestUser(emails.noRow, TEST_PASSWORD)
  normalId = await createTestUser(emails.normal, TEST_PASSWORD)
  modId = await createTestUser(emails.mod, TEST_PASSWORD)
  adminId = await createTestUser(emails.admin, TEST_PASSWORD)
  admin2Id = await createTestUser(emails.admin2, TEST_PASSWORD)
  createdAuthUserIds.push(noRowId, normalId, modId, adminId, admin2Id)

  await unwrap(
    dbAdmin.from('usuario').insert([
      { id: normalId, rol: 'user' },
      { id: modId, rol: 'mod' },
      { id: adminId, rol: 'admin' },
      { id: admin2Id, rol: 'admin' }
    ])
  )

  clientNoRow = await signInTestUser(emails.noRow, TEST_PASSWORD)
  clientNormal = await signInTestUser(emails.normal, TEST_PASSWORD)
  clientMod = await signInTestUser(emails.mod, TEST_PASSWORD)
  clientAdmin = await signInTestUser(emails.admin, TEST_PASSWORD)
  clientAdmin2 = await signInTestUser(emails.admin2, TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-rls-${runId}`, slug: `cat-rls-${runId}` })
      .select('id')
      .single()
  )
  categoriaId = categoria.id
  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({ titulo: 'Serie RLS', slug: `rls-${runId}`, categoria_id: categoria.id })
      .select('id')
      .single()
  )
  serieId = serie.id
  const canal = await unwrap(
    dbAdmin
      .from('canal')
      .insert({ nombre: 'Canal objetivo RLS', handle: `rls-target-${runId}` })
      .select('id')
      .single()
  )
  targetCanalId = canal.id
  // Fila participa del fixture: objetivo de las pruebas de update/delete de
  // user (denegado, queda intacta) y de mod (permitido).
  await unwrap(
    dbAdmin
      .from('participa')
      .insert({ serie_id: serieId, canal_id: targetCanalId, rol: 'colaborador' })
  )
  await unwrap(
    dbAdmin.from('valoracion').insert({ user_id: adminId, serie_id: serieId, nota: 8 })
  )
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M3 RLS — anon', () => {
  it('anon: SELECT en catálogo ok', async () => {
    for (const table of ['categoria', 'canal', 'serie', 'episodio', 'participa']) {
      const { error } = await db.from(table).select('*').limit(1)
      expect(error, `SELECT público debería funcionar en ${table}`).toBeNull()
    }
  })

  it('anon: SELECT en valoracion ok', async () => {
    const { error, data } = await db.from('valoracion').select('*').limit(1)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it('anon: INSERT/UPDATE/DELETE denegados en catálogo y valoracion', async () => {
    const denial = /permission denied|row-level security/i
    await expect(
      unwrap(db.from('canal').insert({ nombre: 'X', handle: `rls-anon-${runId}` }))
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('canal').update({ nombre: 'hack' }).eq('id', targetCanalId))
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('canal').delete().eq('id', targetCanalId))
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('valoracion').insert({ user_id: normalId, serie_id: serieId, nota: 5 }))
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('valoracion').update({ nota: 1 }).not('id', 'is', null))
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('valoracion').delete().not('id', 'is', null))
    ).rejects.toThrow(denial)
  })

  // 010 (ADM-07): completa la cobertura de escritura denegada para anon en
  // las tablas que faltaban (el test anterior cubría canal y valoracion).
  it('anon: INSERT en serie/episodio/participa denegados', async () => {
    const denial = /permission denied|row-level security/i
    await expect(
      unwrap(
        db.from('serie').insert({ titulo: 'X', slug: `rls-anon-${runId}`, categoria_id: categoriaId })
      )
    ).rejects.toThrow(denial)
    await expect(
      unwrap(
        db
          .from('episodio')
          .insert({ serie_id: serieId, numero: 99, titulo: 'X', video_id: `rls-anon-${runId}` })
      )
    ).rejects.toThrow(denial)
    await expect(
      unwrap(db.from('participa').insert({ serie_id: serieId, canal_id: targetCanalId }))
    ).rejects.toThrow(denial)
  })
})

describe('M3 RLS — authenticated sin fila en usuario', () => {
  it('escritura en catálogo denegada (is_admin_or_mod = false)', async () => {
    await expect(
      unwrap(clientNoRow.from('canal').insert({ nombre: 'Y', handle: `rls-norow-${runId}` }))
    ).rejects.toThrow(/row-level security/)

    const { data: updated } = await clientNoRow
      .from('canal')
      .update({ nombre: 'hack' })
      .eq('id', targetCanalId)
      .select()
    expect(updated).toHaveLength(0)

    const { data: deleted } = await clientNoRow
      .from('canal')
      .delete()
      .eq('id', targetCanalId)
      .select()
    expect(deleted).toHaveLength(0)

    const row = await unwrap(
      dbAdmin.from('canal').select('nombre').eq('id', targetCanalId).single()
    )
    expect(row.nombre).toBe('Canal objetivo RLS')
  })
})

describe('M3 RLS — authenticated normal', () => {
  it('valoracion propia ok; valoracion de otro user_id denegada', async () => {
    const row = await unwrap(
      clientNormal
        .from('valoracion')
        .insert({ user_id: normalId, serie_id: serieId, nota: 9 })
        .select('id')
        .single()
    )
    expect(row.id).toBeDefined()

    await expect(
      unwrap(
        clientNormal.from('valoracion').insert({ user_id: adminId, serie_id: serieId, nota: 3 })
      )
    ).rejects.toThrow(/row-level security/)
  })

  // 010 (ADM-07): user sin rol mod/admin no puede escribir en el catálogo.
  // INSERT viola WITH CHECK → error; UPDATE/DELETE no ven filas (USING) → 0
  // filas afectadas y el estado queda intacto.
  it('escritura en serie/episodio/participa denegada (is_admin_or_mod = false)', async () => {
    await expect(
      unwrap(
        clientNormal
          .from('serie')
          .insert({ titulo: 'Y', slug: `rls-user-${runId}`, categoria_id: categoriaId })
      )
    ).rejects.toThrow(/row-level security/)
    await expect(
      unwrap(
        clientNormal
          .from('episodio')
          .insert({ serie_id: serieId, numero: 98, titulo: 'Y', video_id: `rls-user-${runId}` })
      )
    ).rejects.toThrow(/row-level security/)
    await expect(
      unwrap(clientNormal.from('participa').insert({ serie_id: serieId, canal_id: targetCanalId }))
    ).rejects.toThrow(/row-level security/)

    const { data: updatedSerie } = await clientNormal
      .from('serie')
      .update({ titulo: 'hack' })
      .eq('id', serieId)
      .select()
    expect(updatedSerie).toHaveLength(0)

    const { data: updatedParticipa } = await clientNormal
      .from('participa')
      .update({ rol: 'invitado' })
      .eq('serie_id', serieId)
      .select()
    expect(updatedParticipa).toHaveLength(0)

    const { data: deletedParticipa } = await clientNormal
      .from('participa')
      .delete()
      .eq('serie_id', serieId)
      .select()
    expect(deletedParticipa).toHaveLength(0)

    const fila = await unwrap(
      dbAdmin
        .from('participa')
        .select('rol')
        .eq('serie_id', serieId)
        .eq('canal_id', targetCanalId)
        .single()
    )
    expect(fila.rol).toBe('colaborador')
  })
})

describe('M3 RLS — admin', () => {
  it('escritura en catálogo ok', async () => {
    const categoria = await unwrap(
      clientAdmin
        .from('categoria')
        .insert({ nombre: `cat-rls-admin-${runId}`, slug: `cat-rls-admin-${runId}` })
        .select('id')
        .single()
    )
    await unwrap(
      clientAdmin.from('canal').insert({ nombre: 'Canal Admin', handle: `rls-admin-${runId}` })
    )
    await unwrap(
      clientAdmin
        .from('serie')
        .insert({ titulo: 'Serie Admin', slug: `rls-admin-${runId}`, categoria_id: categoria.id })
    )
  })
})

// 010 (ADM-07): el rol mod tiene el mismo permiso de escritura que admin vía
// is_admin_or_mod(). M3 ya crea las políticas; aquí se cubre explícitamente.
describe('M3 RLS — mod', () => {
  it('escritura en catálogo ok (serie, episodio, canal, participa)', async () => {
    const canal = await unwrap(
      clientMod
        .from('canal')
        .insert({ nombre: 'Canal Mod', handle: `rls-mod-${runId}` })
        .select('id')
        .single()
    )
    const canalEditado = await unwrap(
      clientMod.from('canal').update({ nombre: 'Canal Mod editado' }).eq('id', canal.id).select('nombre').single()
    )
    expect(canalEditado.nombre).toBe('Canal Mod editado')

    const serie = await unwrap(
      clientMod
        .from('serie')
        .insert({ titulo: 'Serie Mod', slug: `rls-mod-serie-${runId}`, categoria_id: categoriaId })
        .select('id')
        .single()
    )
    const serieEditada = await unwrap(
      clientMod.from('serie').update({ titulo: 'Serie Mod editada' }).eq('id', serie.id).select('titulo').single()
    )
    expect(serieEditada.titulo).toBe('Serie Mod editada')

    const episodio = await unwrap(
      clientMod
        .from('episodio')
        .insert({
          serie_id: serie.id,
          temporada: 1,
          numero: 1,
          titulo: 'Episodio mod',
          video_id: `rls-mod-${runId}`
        })
        .select('id')
        .single()
    )
    expect(episodio.id).toBeDefined()

    await unwrap(
      clientMod
        .from('participa')
        .insert({ serie_id: serie.id, canal_id: canal.id, rol: 'colaborador' })
    )
  })

  it('update y delete sobre participa existente ok', async () => {
    const actualizada = await unwrap(
      clientMod
        .from('participa')
        .update({ rol: 'principal' })
        .eq('serie_id', serieId)
        .eq('canal_id', targetCanalId)
        .select('rol')
        .single()
    )
    expect(actualizada.rol).toBe('principal')

    const borrada = await unwrap(
      clientMod.from('participa').delete().eq('serie_id', serieId).select('canal_id')
    )
    expect(borrada).toHaveLength(1)

    const restantes = await unwrap(dbAdmin.from('participa').select('canal_id').eq('serie_id', serieId))
    expect(restantes).toHaveLength(0)
  })
})

describe('M3 RLS — trigger anti-escalada', () => {
  it('usuario normal no puede cambiar su propio rol', async () => {
    await expect(
      unwrap(clientNormal.from('usuario').update({ rol: 'admin' }).eq('id', normalId))
    ).rejects.toThrow(/no puede cambiar su propio rol/)
  })

  it('admin sí puede cambiar su propio rol (admin → mod)', async () => {
    const row = await unwrap(
      clientAdmin2.from('usuario').update({ rol: 'mod' }).eq('id', admin2Id).select().single()
    )
    expect(row.rol).toBe('mod')
  })
})
