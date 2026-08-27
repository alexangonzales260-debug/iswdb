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
let adminId: string
let admin2Id: string
let clientNoRow: SupabaseClient
let clientNormal: SupabaseClient
let clientAdmin: SupabaseClient
let clientAdmin2: SupabaseClient
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
    admin: `rls-admin-${runId}@iswdb.local`,
    admin2: `rls-admin2-${runId}@iswdb.local`
  }
  noRowId = await createTestUser(emails.noRow, TEST_PASSWORD)
  normalId = await createTestUser(emails.normal, TEST_PASSWORD)
  adminId = await createTestUser(emails.admin, TEST_PASSWORD)
  admin2Id = await createTestUser(emails.admin2, TEST_PASSWORD)
  createdAuthUserIds.push(noRowId, normalId, adminId, admin2Id)

  await unwrap(
    dbAdmin.from('usuario').insert([
      { id: normalId, rol: 'user' },
      { id: adminId, rol: 'admin' },
      { id: admin2Id, rol: 'admin' }
    ])
  )

  clientNoRow = await signInTestUser(emails.noRow, TEST_PASSWORD)
  clientNormal = await signInTestUser(emails.normal, TEST_PASSWORD)
  clientAdmin = await signInTestUser(emails.admin, TEST_PASSWORD)
  clientAdmin2 = await signInTestUser(emails.admin2, TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-rls-${runId}`, slug: `cat-rls-${runId}` })
      .select('id')
      .single()
  )
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
