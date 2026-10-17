import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  createTestUser,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from './env'

// F029: tabla episodio_sugerencia (M24).
// RLS mod-only: authenticated mod OK, user NO, anon NO.
// UNIQUE (serie_id, video_id_youtube) 23505.
// FK cascade: borrar serie elimina sugerencias.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let clientMod: SupabaseClient<Database>
let clientUser: SupabaseClient<Database>

let serieId: string

function emailDe(nombre: string): string {
  return `sug-${nombre}-${runId}@iswdb.local`
}

async function crearUsuario(nombre: string, rol: string): Promise<string> {
  const uid = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(uid)
  await unwrap(
    dbAdmin
      .from('usuario')
      .insert({ id: uid, rol, username: usernameDesdeEmail(emailDe(nombre), uid) })
  )
  return uid
}

beforeAll(async () => {
  runId = Date.now()

  await crearUsuario('mod', 'mod')
  await crearUsuario('user', 'user')
  clientMod = await signInTestUser(emailDe('mod'), TEST_PASSWORD)
  clientUser = await signInTestUser(emailDe('user'), TEST_PASSWORD)

  const cat = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Sug Cat ${runId}`, slug: `sug-cat-${runId}` })
      .select('id')
      .single()
  )
  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Sugerencia',
        slug: `sug-serie-${runId}`,
        categoria_id: cat.id,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  serieId = serie.id
}, 120_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
  for (const uid of createdAuthUserIds) {
    await deleteTestUser(uid)
  }
})

describe('episodio_sugerencia RLS y restricciones', () => {
  it('mod: insert/select/update/delete OK', async () => {
    const data = await unwrap(
      clientMod
        .from('episodio_sugerencia')
        .insert({
          serie_id: serieId,
          video_id_youtube: 'vid1',
          titulo_detectado: 'Ep 1'
        })
        .select()
        .single()
    )
    expect(data.estado).toBe('pendiente')

    const sel = await unwrap(clientMod.from('episodio_sugerencia').select('id').eq('id', data.id).single())
    expect(sel.id).toBe(data.id)

    await unwrap(clientMod.from('episodio_sugerencia').update({ estado: 'aprobado' }).eq('id', data.id))
    const upd = await unwrap(clientMod.from('episodio_sugerencia').select('estado').eq('id', data.id).single())
    expect(upd.estado).toBe('aprobado')

    await unwrap(clientMod.from('episodio_sugerencia').delete().eq('id', data.id))
    const del = await unwrap(clientMod.from('episodio_sugerencia').select('id').eq('id', data.id))
    expect(del).toHaveLength(0)
  })

  it('usuario estándar: denegado (0 filas)', async () => {
    const { data } = await clientUser.from('episodio_sugerencia').select('*')
    expect(data).toHaveLength(0)

    const { error } = await clientUser.from('episodio_sugerencia').insert({
      serie_id: serieId,
      video_id_youtube: 'vid2',
      titulo_detectado: 'Ep 2'
    })
    expect(error?.message).toMatch(/permission denied|row-level security/i)
  })

  it('UNIQUE (serie_id, video_id_youtube) rechaza duplicados 23505', async () => {
    const payload = { serie_id: serieId, video_id_youtube: 'vid-unique', titulo_detectado: 'U' }
    await unwrap(clientMod.from('episodio_sugerencia').insert(payload))
    const { error } = await clientMod.from('episodio_sugerencia').insert(payload)
    expect(error?.code).toBe('23505')
  })

  it('cascade: borrar serie elimina sugerencias', async () => {
    const s = await unwrap(
      dbAdmin.from('serie').insert({
        titulo: 'Serie Cascade',
        slug: `sug-cascade-${runId}`,
        categoria_id: (await unwrap(dbAdmin.from('categoria').select('id').limit(1).single())).id,
        moderation_status: 'aprobada'
      }).select('id').single()
    )
    await unwrap(clientMod.from('episodio_sugerencia').insert({
      serie_id: s.id,
      video_id_youtube: 'vid-cascade',
      titulo_detectado: 'C'
    }))
    await unwrap(dbAdmin.from('serie').delete().eq('id', s.id))
    const { data } = await dbAdmin.from('episodio_sugerencia').select('id').eq('serie_id', s.id)
    expect(data).toHaveLength(0)
  })
})
