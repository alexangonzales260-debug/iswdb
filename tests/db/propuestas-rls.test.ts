import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
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

// F011 (PRO-01/PRO-04/PRO-06): acceso de propuestas.
// M8 añade proponente_email + user_id nullable, divide serie_select_public
// (anon → solo aprobada) y crea la función crear_propuesta() SECURITY DEFINER
// (pendiente + user_id null forzados; serie + participa en una transacción).
// NO hay inserts directos para anon (M1 solo da SELECT): la política RLS de
// insert anon+pendiente es inviable porque PG exige en el INSERT la visibilidad
// SELECT del rol (verificado 28-ago-2026) → la escritura entra solo por la RPC.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
let normalId: string
let modId: string
let clientNormal: SupabaseClient
let clientMod: SupabaseClient
let categoriaId: string
let canalId: string
let canalInexistente: string
let aprobadaId: string
const slugsCreados: string[] = []
const createdAuthUserIds: string[] = []

function slugProp(etiqueta: string): string {
  const slug = `prop-rls-${etiqueta}-${runId}`
  slugsCreados.push(slug)
  return slug
}

beforeAll(async () => {
  runId = Date.now()

  normalId = await createTestUser(`prop-rls-user-${runId}@iswdb.local`, TEST_PASSWORD)
  modId = await createTestUser(`prop-rls-mod-${runId}@iswdb.local`, TEST_PASSWORD)
  createdAuthUserIds.push(normalId, modId)

  await unwrap(
    dbAdmin.from('usuario').insert([
      {
        id: normalId,
        rol: 'user',
        username: usernameDesdeEmail(`prop-rls-user-${runId}@iswdb.local`, normalId)
      },
      {
        id: modId,
        rol: 'mod',
        username: usernameDesdeEmail(`prop-rls-mod-${runId}@iswdb.local`, modId)
      }
    ])
  )

  clientNormal = await signInTestUser(`prop-rls-user-${runId}@iswdb.local`, TEST_PASSWORD)
  clientMod = await signInTestUser(`prop-rls-mod-${runId}@iswdb.local`, TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-prop-rls-${runId}`, slug: `cat-prop-rls-${runId}` })
      .select('id')
      .single()
  )
  categoriaId = categoria.id
  const canal = await unwrap(
    dbAdmin
      .from('canal')
      .insert({ nombre: 'Canal prop RLS', handle: `canal-prop-rls-${runId}` })
      .select('id')
      .single()
  )
  canalId = canal.id
  // UUID sin fila en canal: la FK canal_id de participa lo rechaza.
  canalInexistente = '00000000-0000-0000-0000-000000000099'

  const aprobada = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie aprobada prop RLS',
        slug: slugProp('aprobada'),
        categoria_id: categoriaId,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  aprobadaId = aprobada.id
}, 60_000)

afterAll(async () => {
  await dbAdmin.from('serie').delete().in('slug', slugsCreados)
  await dbAdmin.from('canal').delete().eq('id', canalId)
  await dbAdmin.from('categoria').delete().eq('id', categoriaId)
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

async function rpcPropuesta(client: SupabaseClient, slug: string) {
  const { error } = await client.rpc('crear_propuesta', {
    p_titulo: 'Propuesta RLS',
    p_descripcion: 'Descripción de la propuesta de prueba.',
    p_categoria_id: categoriaId,
    p_playlist_url: null,
    p_proponente_email: 'contacto@example.com',
    p_slug: slug,
    p_canales: [{ canal_id: canalId, rol: 'principal' }] as unknown as object
  })
  if (error) throw new Error(error.message)
}

describe('F011 RLS — crear_propuesta (PRO-01/PRO-04)', () => {
  it('anon: RPC crea serie pendiente + participa en una transacción', async () => {
    const slug = slugProp('anon-rpc')
    await rpcPropuesta(db, slug)

    const serie = await unwrap(
      dbAdmin
        .from('serie')
        .select('id, slug, moderation_status, user_id, proponente_email')
        .eq('slug', slug)
        .single()
    )
    expect(serie.slug).toBe(slug)
    expect(serie.moderation_status).toBe('pendiente')
    expect(serie.user_id).toBeNull()
    expect(serie.proponente_email).toBe('contacto@example.com')

    const serieId = serie.id
    const participaciones = await unwrap(
      dbAdmin.from('participa').select('canal_id, rol').eq('serie_id', serieId)
    )
    expect(participaciones).toEqual([{ canal_id: canalId, rol: 'principal' }])
  })

  it('anon: RPC con canal inexistente → error FK (no se crean canales, PRO-03)', async () => {
    await expect(
      (async () => {
        const { error } = await db.rpc('crear_propuesta', {
          p_titulo: 'Propuesta con canal basura',
          p_descripcion: 'Descripción de la propuesta de prueba.',
          p_categoria_id: categoriaId,
          p_playlist_url: null,
          p_proponente_email: null,
          p_slug: slugProp('anon-canal-inexistente'),
          p_canales: [{ canal_id: canalInexistente, rol: 'principal' }] as unknown as object
        })
        if (error) throw new Error(error.message)
      })()
    ).rejects.toThrow(/23503|foreign key/i)
  })

  it('user autenticado: RPC crea propuesta pendiente → ok', async () => {
    const slug = slugProp('auth-rpc')
    await rpcPropuesta(clientNormal, slug)
    const serie = await unwrap(
      dbAdmin
        .from('serie')
        .select('slug, moderation_status, user_id')
        .eq('slug', slug)
        .single()
    )
    expect(serie).toEqual({ slug, moderation_status: 'pendiente', user_id: null })
  })
})

describe('F011 RLS — sin INSERT directo', () => {
  it('anon: INSERT directo en serie → permission denied (solo RPC)', async () => {
    await expect(
      unwrap(
        db.from('serie').insert({
          titulo: 'Intento directo anon',
          slug: slugProp('anon-directo'),
          categoria_id: categoriaId,
          moderation_status: 'pendiente'
        })
      )
    ).rejects.toThrow(/permission denied/i)
  })

  it('anon: INSERT directo en participa → permission denied', async () => {
    await expect(
      unwrap(db.from('participa').insert({ serie_id: aprobadaId, canal_id: canalId }))
    ).rejects.toThrow(/permission denied/i)
  })

  it('user autenticado: INSERT directo pendiente → RLS denegado (sin rol mod)', async () => {
    await expect(
      unwrap(
        clientNormal
          .from('serie')
          .insert({
            titulo: 'Intento directo user',
            slug: slugProp('auth-directo'),
            categoria_id: categoriaId,
            moderation_status: 'pendiente'
          })
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('mod: INSERT directo → ok (is_admin_or_mod, M3 intacto)', async () => {
    const fila = await unwrap(
      clientMod
        .from('serie')
        .insert({
          titulo: 'Serie del mod',
          slug: slugProp('mod-directo'),
          categoria_id: categoriaId,
          moderation_status: 'aprobada'
        })
        .select('moderation_status')
        .single()
    )
    expect(fila.moderation_status).toBe('aprobada')
  })
})

describe('F011 RLS — lectura (PRO-06)', () => {
  it('anon: SELECT de serie pendiente → 0 filas', async () => {
    const pendiente = slugsCreados.find((s) => s.includes('anon-rpc'))!
    const { data, error } = await db.from('serie').select('slug').eq('slug', pendiente)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('anon: SELECT de serie aprobada → ok', async () => {
    const aprobada = slugsCreados.find((s) => s.includes('aprobada'))!
    const fila = await unwrap(db.from('serie').select('slug').eq('slug', aprobada))
    expect(fila).toEqual([{ slug: aprobada }])
  })

  // Documentado en el plan (decisión 3): authenticated conserva la lectura
  // completa porque VAL-07 (lib/valoraciones.ts) y RES-01 (lib/reseñas.ts)
  // leen pendientes para devolver mensajes amigables (serieNoAprobada).
  it('user autenticado: SELECT de serie pendiente → ok (VAL-07/RES-01)', async () => {
    const pendiente = slugsCreados.find((s) => s.includes('anon-rpc'))!
    const fila = await unwrap(
      clientNormal.from('serie').select('slug, moderation_status').eq('slug', pendiente)
    )
    expect(fila).toEqual([{ slug: pendiente, moderation_status: 'pendiente' }])
  })

  it('mod: SELECT de serie pendiente → ok (listSeriesPendientes, F010)', async () => {
    const pendiente = slugsCreados.find((s) => s.includes('anon-rpc'))!
    const fila = await unwrap(
      clientMod.from('serie').select('slug, moderation_status').eq('slug', pendiente)
    )
    expect(fila).toEqual([{ slug: pendiente, moderation_status: 'pendiente' }])
  })
})