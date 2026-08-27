import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, dbAdmin, deleteTestUser, requireLocalDb, unwrap } from './env'

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'
const createdAuthUserIds: string[] = []
let userIdA: string
let userIdB: string
let serieId: string
let runSlug: string

async function seedSerie(slug: string): Promise<string> {
  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-${slug}`, slug: `cat-${slug}` })
      .select('id')
      .single()
  )
  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({ titulo: `Serie ${slug}`, slug, categoria_id: categoria.id })
      .select('id')
      .single()
  )
  return serie.id
}

beforeAll(async () => {
  await unwrap(dbAdmin.from('valoracion').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('usuario').delete().not('id', 'is', null))
  await unwrap(dbAdmin.from('serie').delete().like('slug', 'social-%'))
  await unwrap(dbAdmin.from('categoria').delete().like('nombre', 'cat-social-%'))

  const runId = Date.now()
  runSlug = `social-${runId}`
  userIdA = await createTestUser(`social-a-${runId}@iswdb.local`, TEST_PASSWORD)
  userIdB = await createTestUser(`social-b-${runId}@iswdb.local`, TEST_PASSWORD)
  createdAuthUserIds.push(userIdA, userIdB)

  await unwrap(dbAdmin.from('usuario').insert({ id: userIdA }))
  serieId = await seedSerie(runSlug)
}, 60_000)

afterAll(async () => {
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M2 social — invariants', () => {
  it('valoracion: nota fuera de rango (0 y 11) → error de BD', async () => {
    await expect(
      unwrap(dbAdmin.from('valoracion').insert({ user_id: userIdA, serie_id: serieId, nota: 0 }))
    ).rejects.toThrow(/check constraint/)
    await expect(
      unwrap(dbAdmin.from('valoracion').insert({ user_id: userIdA, serie_id: serieId, nota: 11 }))
    ).rejects.toThrow(/check constraint/)
  })

  it('valoracion: UNIQUE(user_id, serie_id) → error de BD', async () => {
    await unwrap(
      dbAdmin.from('valoracion').insert({ user_id: userIdA, serie_id: serieId, nota: 5 })
    )
    await expect(
      unwrap(dbAdmin.from('valoracion').insert({ user_id: userIdA, serie_id: serieId, nota: 7 }))
    ).rejects.toThrow(/duplicate key/)
  })

  it('usuario: FK a auth.users con id inexistente → error de BD', async () => {
    await expect(
      unwrap(dbAdmin.from('usuario').insert({ id: crypto.randomUUID() }))
    ).rejects.toThrow(/foreign key/)
  })

  it('usuario: rol fuera de CHECK → error de BD', async () => {
    await expect(
      unwrap(dbAdmin.from('usuario').insert({ id: userIdB, rol: 'superadmin' }))
    ).rejects.toThrow(/check constraint/)
  })
})
