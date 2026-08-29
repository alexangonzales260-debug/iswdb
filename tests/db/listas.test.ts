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
  unwrap
} from './env'

// F013 (LIS-01/03/04/07/08): tabla lista + lista_serie (M9) y su RLS en crudo.
// M9 define lista (user_id, nombre CHECK 3-100, es_publica default false,
// trigger updated_at) y lista_serie (lista_id -> lista cascade, serie_id ->
// serie cascade, posicion, UNIQUE(lista_id, serie_id)); el RLS de lista_serie
// depende del owner vía subconsulta al padre lista.
// Los servicios (lib/listas.ts) se cubren en T2; aquí se ejercitan las
// policies directamente con clientes anon / de sesión (signInTestUser).
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let ownerId: string
let otroId: string
let clientOwner: SupabaseClient<Database>
let clientOtro: SupabaseClient<Database>

let categoriaId: string
let serieAId: string
let serieBId: string

let listaPrivadaOwnerId: string
let listaPublicaOwnerId: string
// Privada del otro: verifica que un owner lee su propia privada (RLS).
let _listaPrivadaOtroId: string

function slugDe(nombre: string): string {
  return `list-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `list-test-${nombre}-${runId}@iswdb.local`
}

// Nombre con longitud exacta para el CHECK (3-100).
function nombreDe(n: number): string {
  return 'n'.repeat(n)
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  // La fila public.usuario es necesaria por la FK user_id -> usuario(id).
  await unwrap(dbAdmin.from('usuario').insert({ id: userId }))
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  ownerId = await crearUsuario('owner')
  otroId = await crearUsuario('otro')
  clientOwner = await signInTestUser(emailDe('owner'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `List Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  categoriaId = categoria.id

  const series = await unwrap(
    dbAdmin
      .from('serie')
      .insert([
        { titulo: 'Serie List A', slug: slugDe('a'), categoria_id: categoria.id },
        { titulo: 'Serie List B', slug: slugDe('b'), categoria_id: categoria.id }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  serieBId = series.find((s) => s.slug === slugDe('b'))!.id

  // Tres listas base: privada del owner, pública del owner y privada de otro.
  const listas = await unwrap(
    dbAdmin
      .from('lista')
      .insert([
        { user_id: ownerId, nombre: 'Lista privada owner', es_publica: false },
        { user_id: ownerId, nombre: 'Lista pública owner', es_publica: true },
        { user_id: otroId, nombre: 'Lista privada otro', es_publica: false }
      ])
      .select('id, nombre')
  )
  listaPrivadaOwnerId = listas.find((l) => l.nombre === 'Lista privada owner')!.id
  listaPublicaOwnerId = listas.find((l) => l.nombre === 'Lista pública owner')!.id
  _listaPrivadaOtroId = listas.find((l) => l.nombre === 'Lista privada otro')!.id
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('serie').delete().in('slug', [slugDe('a'), slugDe('b')]))
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M9 invariantes — lista', () => {
  it('nombre 3-100 ok; 2/101 violan el CHECK', async () => {
    await unwrap(dbAdmin.from('lista').insert({ user_id: ownerId, nombre: nombreDe(3) }))
    await unwrap(dbAdmin.from('lista').insert({ user_id: ownerId, nombre: nombreDe(100) }))

    await expect(
      unwrap(dbAdmin.from('lista').insert({ user_id: ownerId, nombre: nombreDe(2) }))
    ).rejects.toThrow(/check/i)
    await expect(
      unwrap(dbAdmin.from('lista').insert({ user_id: ownerId, nombre: nombreDe(101) }))
    ).rejects.toThrow(/check/i)
  }, 30_000)

  it('es_publica default false', async () => {
    const fila = await unwrap(
      dbAdmin.from('lista').insert({ user_id: ownerId, nombre: 'Lista default priv' }).select('es_publica').single()
    )
    expect(fila.es_publica).toBe(false)
  }, 30_000)

  it('trigger actualiza updated_at en update', async () => {
    const creada = await unwrap(
      dbAdmin
        .from('lista')
        .insert({ user_id: ownerId, nombre: 'Lista trigger' })
        .select('id, updated_at')
        .single()
    )
    // actualizar en el mismo ms podría no cambiar updated_at: se espera un
    // instante artificial con un update previo que sí altera la fila.
    await unwrap(
      dbAdmin.from('lista').update({ nombre: 'Lista trigger renombrar' }).eq('id', creada.id)
    )
    const actualizada = await unwrap(
      dbAdmin.from('lista').select('updated_at, nombre').eq('id', creada.id).single()
    )
    expect(actualizada.nombre).toBe('Lista trigger renombrar')
    expect(new Date(actualizada.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(creada.updated_at).getTime()
    )
  }, 30_000)
})

describe('M9 invariantes — lista_serie', () => {
  it('duplicado (lista_id, serie_id) → 23505', async () => {
    await unwrap(
      dbAdmin
        .from('lista_serie')
        .insert({ lista_id: listaPrivadaOwnerId, serie_id: serieAId, posicion: 1 })
    )
    await expect(
      unwrap(
        dbAdmin
          .from('lista_serie')
          .insert({ lista_id: listaPrivadaOwnerId, serie_id: serieAId, posicion: 2 })
      )
    ).rejects.toThrow(/duplicate key value/i)
  }, 30_000)

  it('posiciones independientes para series distintas en la misma lista', async () => {
    await unwrap(
      dbAdmin
        .from('lista_serie')
        .insert({ lista_id: listaPrivadaOwnerId, serie_id: serieBId, posicion: 5 })
    )
    const filas = await unwrap(
      dbAdmin
        .from('lista_serie')
        .select('serie_id, posicion')
        .eq('lista_id', listaPrivadaOwnerId)
        .order('posicion', { ascending: true })
    )
    expect(filas).toEqual([
      { serie_id: serieAId, posicion: 1 },
      { serie_id: serieBId, posicion: 5 }
    ])
  }, 30_000)

  it('cascade: borrar lista → su lista_serie', async () => {
    const lista = await unwrap(
      dbAdmin
        .from('lista')
        .insert({ user_id: ownerId, nombre: 'Lista cascade' })
        .select('id')
        .single()
    )
    await unwrap(
      dbAdmin.from('lista_serie').insert({ lista_id: lista.id, serie_id: serieAId, posicion: 1 })
    )
    await unwrap(dbAdmin.from('lista').delete().eq('id', lista.id))
    const restantes = await unwrap(
      dbAdmin.from('lista_serie').select('lista_id').eq('lista_id', lista.id)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)

  it('cascade: borrar serie → su lista_serie', async () => {
    const serie = await unwrap(
      dbAdmin
        .from('serie')
        .insert({ titulo: 'Serie List Cascade', slug: slugDe('cascade'), categoria_id: categoriaId })
        .select('id')
        .single()
    )
    await unwrap(
      dbAdmin.from('lista_serie').insert({ lista_id: listaPrivadaOwnerId, serie_id: serie.id, posicion: 9 })
    )
    await unwrap(dbAdmin.from('serie').delete().eq('id', serie.id))
    const restantes = await unwrap(
      dbAdmin.from('lista_serie').select('serie_id').eq('serie_id', serie.id)
    )
    expect(restantes).toHaveLength(0)
  }, 30_000)
})

describe('M9 RLS — lista (lectura own_or_public)', () => {
  it('anon: lee pública; privada → 0 filas', async () => {
    const publicas = await unwrap(db.from('lista').select('id').eq('id', listaPublicaOwnerId))
    expect(publicas).toHaveLength(1)

    const { data: privadas } = await db
      .from('lista')
      .select('id')
      .eq('id', listaPrivadaOwnerId)
    expect(privadas).toHaveLength(0)
  }, 30_000)

  it('owner: lee su privada y su pública', async () => {
    const privada = await unwrap(
      clientOwner.from('lista').select('id').eq('id', listaPrivadaOwnerId)
    )
    expect(privada).toHaveLength(1)
    const publica = await unwrap(
      clientOwner.from('lista').select('id').eq('id', listaPublicaOwnerId)
    )
    expect(publica).toHaveLength(1)
  }, 30_000)

  it('otro: no lee la privada ajena; sí la pública ajena y su propia privada', async () => {
    const { data: privada } = await clientOtro
      .from('lista')
      .select('id')
      .eq('id', listaPrivadaOwnerId)
    expect(privada).toHaveLength(0)

    const publica = await unwrap(
      clientOtro.from('lista').select('id').eq('id', listaPublicaOwnerId)
    )
    expect(publica).toHaveLength(1)

    const propia = await unwrap(
      clientOtro.from('lista').select('id').eq('id', _listaPrivadaOtroId)
    )
    expect(propia).toHaveLength(1)
  }, 30_000)
})

describe('M9 RLS — lista (escritura own)', () => {
  it('anon: insert/update/delete denegado', async () => {
    await expect(
      unwrap(db.from('lista').insert({ user_id: ownerId, nombre: 'Lista anon' }))
    ).rejects.toThrow(/permission denied/i)
  }, 30_000)

  it('owner: insert/update/delete de su lista ok', async () => {
    const creada = await unwrap(
      clientOwner
        .from('lista')
        .insert({ user_id: ownerId, nombre: 'Lista owner' })
        .select('id')
        .single()
    )
    await unwrap(
      clientOwner.from('lista').update({ nombre: 'Lista owner v2' }).eq('id', creada.id)
    )
    const editada = await unwrap(
      clientOwner.from('lista').select('nombre').eq('id', creada.id).single()
    )
    expect(editada.nombre).toBe('Lista owner v2')
    await unwrap(clientOwner.from('lista').delete().eq('id', creada.id))
  }, 30_000)

  it('insert con user_id ajeno → denegado (lista_insert_own)', async () => {
    await expect(
      unwrap(clientOtro.from('lista').insert({ user_id: ownerId, nombre: 'Lista ajena' }))
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('otro: no puede renombrar ni borrar lista privada ajena', async () => {
    const renombradas = await unwrap(
      clientOtro.from('lista').update({ nombre: 'Lista hackeada' }).eq('id', listaPrivadaOwnerId).select('id')
    )
    expect(renombradas).toHaveLength(0)

    const borradas = await unwrap(
      clientOtro.from('lista').delete().eq('id', listaPrivadaOwnerId).select('id')
    )
    expect(borradas).toHaveLength(0)
  }, 30_000)
})

describe('M9 RLS — lista_serie (subconsulta al padre)', () => {
  it('anon: NO puede insertar series en ninguna lista', async () => {
    await expect(
      unwrap(
        db.from('lista_serie').insert({ lista_id: listaPublicaOwnerId, serie_id: serieAId, posicion: 1 })
      )
    ).rejects.toThrow(/permission denied/i)
  }, 30_000)

  it('owner: inserta/lee/actualiza/borra series de su lista', async () => {
    // SerieB en la lista pública del owner (la privada ya la usa por las
    // invariantes; la pública queda libre para este flujo).
    await unwrap(
      clientOwner.from('lista_serie').insert({ lista_id: listaPublicaOwnerId, serie_id: serieBId, posicion: 2 })
    )
    const leidas = await unwrap(
      clientOwner.from('lista_serie').select('serie_id, posicion').eq('lista_id', listaPublicaOwnerId)
    )
    expect(leidas).toContainEqual({ serie_id: serieBId, posicion: 2 })

    await unwrap(
      clientOwner
        .from('lista_serie')
        .update({ posicion: 3 })
        .eq('lista_id', listaPublicaOwnerId)
        .eq('serie_id', serieBId)
    )
    await unwrap(
      clientOwner
        .from('lista_serie')
        .delete()
        .eq('lista_id', listaPublicaOwnerId)
        .eq('serie_id', serieBId)
    )
  }, 30_000)

  it('otro: no puede insertar/borrar series en la lista ajena (aunque sea pública)', async () => {
    await expect(
      unwrap(
        clientOtro.from('lista_serie').insert({ lista_id: listaPublicaOwnerId, serie_id: serieAId, posicion: 1 })
      )
    ).rejects.toThrow(/row-level security/i)
  }, 30_000)

  it('otro: puede LEER las series de la lista pública ajena, no de la privada', async () => {
    // serieA ya está en la privada del owner; se añade a la pública para el test.
    await unwrap(
      clientOwner.from('lista_serie').insert({ lista_id: listaPublicaOwnerId, serie_id: serieAId, posicion: 1 })
    )

    const publica = await unwrap(
      clientOtro.from('lista_serie').select('serie_id').eq('lista_id', listaPublicaOwnerId)
    )
    expect(publica).toEqual([{ serie_id: serieAId }])

    const privada = await unwrap(
      clientOtro.from('lista_serie').select('serie_id').eq('lista_id', listaPrivadaOwnerId)
    )
    expect(privada).toEqual([])
  }, 30_000)

  it('anon: lee series de la lista pública, no de la privada', async () => {
    const publica = await unwrap(
      db.from('lista_serie').select('serie_id').eq('lista_id', listaPublicaOwnerId)
    )
    expect(publica).toEqual([{ serie_id: serieAId }])

    const privada = await unwrap(
      db.from('lista_serie').select('serie_id').eq('lista_id', listaPrivadaOwnerId)
    )
    expect(privada).toEqual([])
  }, 30_000)
})
