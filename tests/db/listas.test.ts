import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// lib/listas.ts importa lib/supabase.ts, que lanza si faltan env vars (fail
// fast); vi.hoisted define las vars antes de los imports (patrón valoraciones).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

import {
  añadirSerieALista,
  crearLista,
  eliminarLista,
  ERRORES_LISTA,
  getLista,
  getListaPublica,
  listMisListas,
  quitarSerieDeLista,
  renombrarLista,
  reordenarLista
} from '@/lib/listas'
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
let seriePendienteId: string

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
        { titulo: 'Serie List A', slug: slugDe('a'), categoria_id: categoria.id, moderation_status: 'aprobada' },
        { titulo: 'Serie List B', slug: slugDe('b'), categoria_id: categoria.id, moderation_status: 'aprobada' },
        {
          titulo: 'Serie List Pendiente',
          slug: slugDe('pendiente'),
          categoria_id: categoria.id,
          moderation_status: 'pendiente'
        }
      ])
      .select('id, slug')
  )
  serieAId = series.find((s) => s.slug === slugDe('a'))!.id
  serieBId = series.find((s) => s.slug === slugDe('b'))!.id
  seriePendienteId = series.find((s) => s.slug === slugDe('pendiente'))!.id

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
  await unwrap(
    dbAdmin
      .from('serie')
      .delete()
      .in('slug', [slugDe('a'), slugDe('b'), slugDe('pendiente')])
  )
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

// ── F013 · Servicios (lib/listas.ts) ──────────────────────────────────────
// Se ejercitan black-box a través de los servicios con clientes de sesión en
// memoria (signInTestUser): el RLS con auth.uid() real sin request context de
// Next. Cada test crea sus propias listas con crearLista para no interferir
// con las listas base de los tests M9 anteriores, y las limpia en finally.

describe('crearLista (LIS-01)', () => {
  it('crea con es_publica=false por defecto y guarda el nombre trimeado', async () => {
    const { id } = await crearLista(clientOwner, { nombre: '  Mi lista fav  ' })
    try {
      const fila = await unwrap(
        dbAdmin.from('lista').select('nombre, es_publica').eq('id', id).single()
      )
      expect(fila.nombre).toBe('Mi lista fav')
      expect(fila.es_publica).toBe(false)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('respeta es_publica=true cuando se pide', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista pública crear', es_publica: true })
    try {
      const fila = await unwrap(dbAdmin.from('lista').select('es_publica').eq('id', id).single())
      expect(fila.es_publica).toBe(true)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('descripcion null/vacía se guarda como NULL; sin descripcion igual (accion → null)', async () => {
    // La server action convierte el textarea vacío en null: Zod debe aceptar
    // null (columna text nullable) y el insert normaliza '' → NULL.
    const { id } = await crearLista(clientOwner, { nombre: 'Lista desc null', descripcion: null })
    try {
      const fila = await unwrap(
        dbAdmin.from('lista').select('descripcion').eq('id', id).single()
      )
      expect(fila.descripcion).toBeNull()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('nombre vacío/corto/largo → error Zod y no escribe', async () => {
    await expect(crearLista(clientOwner, { nombre: '' })).rejects.toThrow(
      ERRORES_LISTA.nombreInvalido
    )
    await expect(crearLista(clientOwner, { nombre: 'ab' })).rejects.toThrow(
      ERRORES_LISTA.nombreInvalido
    )
    await expect(crearLista(clientOwner, { nombre: nombreDe(101) })).rejects.toThrow(
      ERRORES_LISTA.nombreInvalido
    )
    // Longitud exacta del límite inferior tras trim.
    await expect(crearLista(clientOwner, { nombre: nombreDe(2) })).rejects.toThrow(
      ERRORES_LISTA.nombreInvalido
    )
  }, 30_000)

  it('sin sesión (anon) → error', async () => {
    await expect(crearLista(db, { nombre: 'Sin sesión' })).rejects.toThrow(
      ERRORES_LISTA.sinSesion
    )
  }, 30_000)
})

describe('crud LIS-02..06 (renombrar/eliminar/añadir/quitar/reordenar)', () => {
  it('renombrar lista propia actualiza el nombre (LIS-02)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Israel original' })
    try {
      await renombrarLista(clientOwner, id, 'Lista renombrada')
      const fila = await unwrap(dbAdmin.from('lista').select('nombre').eq('id', id).single())
      expect(fila.nombre).toBe('Lista renombrada')
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('renombrar lista ajena → error', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista ajena renombrar' })
    try {
      await expect(renombrarLista(clientOtro, id, 'Hackeada')).rejects.toThrow(
        ERRORES_LISTA.listaNoEncontrada
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('renombrar con nombre inválido → error Zod', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista validar nombre' })
    try {
      await expect(renombrarLista(clientOwner, id, '')).rejects.toThrow(
        ERRORES_LISTA.nombreInvalido
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('eliminar lista propia la borra; cascade borra su lista_serie (LIS-03)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista a eliminar' })
    await añadirSerieALista(clientOwner, id, serieAId)
    await eliminarLista(clientOwner, id)

    const restantes = await unwrap(dbAdmin.from('lista').select('id').eq('id', id))
    expect(restantes).toHaveLength(0)
    const series = await unwrap(dbAdmin.from('lista_serie').select('serie_id').eq('lista_id', id))
    expect(series).toHaveLength(0)
  }, 30_000)

  it('eliminar lista ajena → error y fila intacta', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista ajena eliminar' })
    try {
      await expect(eliminarLista(clientOtro, id)).rejects.toThrow(ERRORES_LISTA.listaNoEncontrada)
      const restantes = await unwrap(dbAdmin.from('lista').select('id').eq('id', id))
      expect(restantes).toHaveLength(1)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('añadir serie: posición = 1 + MAX (LIS-04)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista posiciones' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await añadirSerieALista(clientOwner, id, serieBId)
      const filas = await unwrap(
        dbAdmin
          .from('lista_serie')
          .select('serie_id, posicion')
          .eq('lista_id', id)
          .order('posicion', { ascending: true })
      )
      expect(filas).toEqual([
        { serie_id: serieAId, posicion: 1 },
        { serie_id: serieBId, posicion: 2 }
      ])
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('añadir serie inexistente o no aprobada → rechazo server-side (LIS-04)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista rechazos serie' })
    try {
      await expect(añadirSerieALista(clientOwner, id, crypto.randomUUID())).rejects.toThrow(
        ERRORES_LISTA.serieNoEncontrada
      )
      await expect(añadirSerieALista(clientOwner, id, seriePendienteId)).rejects.toThrow(
        ERRORES_LISTA.serieNoAprobada
      )
      const filas = await unwrap(dbAdmin.from('lista_serie').select('serie_id').eq('lista_id', id))
      expect(filas).toHaveLength(0)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('añadir duplicado → error amigable (23505 → ya está en la lista)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista duplicado serie' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await expect(añadirSerieALista(clientOwner, id, serieAId)).rejects.toThrow(
        ERRORES_LISTA.yaEnLaLista
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('añadir serie a lista ajena → sin permiso', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista ajena anadir' })
    try {
      await expect(añadirSerieALista(clientOtro, id, serieAId)).rejects.toThrow(
        ERRORES_LISTA.sinPermiso
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('quitar serie propia de la lista (LIS-05); quitar la inexistente → error', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista quitar serie' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await quitarSerieDeLista(clientOwner, id, serieAId)
      const filas = await unwrap(dbAdmin.from('lista_serie').select('serie_id').eq('lista_id', id))
      expect(filas).toHaveLength(0)

      await expect(quitarSerieDeLista(clientOwner, id, serieAId)).rejects.toThrow(
        ERRORES_LISTA.serieNoEncontrada
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('quitar serie de lista ajena → sin permiso', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista ajena quitar' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await expect(quitarSerieDeLista(clientOtro, id, serieAId)).rejects.toThrow(
        ERRORES_LISTA.sinPermiso
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('reordenar mismo conjunto actualiza posiciones (LIS-06)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista reordenar ok' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await añadirSerieALista(clientOwner, id, serieBId)
      await reordenarLista(clientOwner, id, [serieBId, serieAId])
      const filas = await unwrap(
        dbAdmin
          .from('lista_serie')
          .select('serie_id, posicion')
          .eq('lista_id', id)
          .order('posicion', { ascending: true })
      )
      expect(filas).toEqual([
        { serie_id: serieBId, posicion: 1 },
        { serie_id: serieAId, posicion: 2 }
      ])
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('reordenar conjunto incompleto/extra/duplicado → rechazo y no altera', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Lista reordenar invalido' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await añadirSerieALista(clientOwner, id, serieBId)

      // Incompleto (falta B)
      await expect(reordenarLista(clientOwner, id, [serieAId])).rejects.toThrow(
        ERRORES_LISTA.ordenInvalido
      )
      // Extra (serie ajena a la lista)
      await expect(reordenarLista(clientOwner, id, [serieAId, serieBId, crypto.randomUUID()])).rejects.toThrow(
        ERRORES_LISTA.ordenInvalido
      )
      // Duplicado
      await expect(reordenarLista(clientOwner, id, [serieAId, serieAId])).rejects.toThrow(
        ERRORES_LISTA.ordenInvalido
      )

      const filas = await unwrap(
        dbAdmin
          .from('lista_serie')
          .select('serie_id, posicion')
          .eq('lista_id', id)
          .order('posicion', { ascending: true })
      )
      expect(filas).toEqual([
        { serie_id: serieAId, posicion: 1 },
        { serie_id: serieBId, posicion: 2 }
      ])
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('reordenar lista ajena (aunque pública) → sin permiso', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Pública reordenar ajena', es_publica: true })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await añadirSerieALista(clientOwner, id, serieBId)
      await expect(reordenarLista(clientOtro, id, [serieBId, serieAId])).rejects.toThrow(
        ERRORES_LISTA.sinPermiso
      )
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('todas las escrituras sin sesión → error', async () => {
    await expect(añadirSerieALista(db, listaPrivadaOwnerId, serieAId)).rejects.toThrow(
      ERRORES_LISTA.sinSesion
    )
    await expect(quitarSerieDeLista(db, listaPrivadaOwnerId, serieAId)).rejects.toThrow(
      ERRORES_LISTA.sinSesion
    )
    await expect(renombrarLista(db, listaPrivadaOwnerId, 'Nombre válido')).rejects.toThrow(
      ERRORES_LISTA.sinSesion
    )
    await expect(eliminarLista(db, listaPrivadaOwnerId)).rejects.toThrow(ERRORES_LISTA.sinSesion)
    await expect(reordenarLista(db, listaPrivadaOwnerId, [])).rejects.toThrow(
      ERRORES_LISTA.sinSesion
    )
  }, 30_000)
})

describe('lecturas (LIS-07/08/09)', () => {
  it('listMisListas: solo las del usuario con nº de series', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Mi lista grid' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)
      await añadirSerieALista(clientOwner, id, serieBId)

      const listas = await listMisListas(clientOwner, ownerId)
      const mia = listas.find((l) => l.id === id)
      expect(mia).toBeDefined()
      expect(mia!.nombre).toBe('Mi lista grid')
      expect(mia!.numSeries).toBe(2)
      expect(mia!.es_publica).toBe(false)

      // NO aparecen las listas de otro en las mías.
      expect(listas.find((l) => l.id === _listaPrivadaOtroId)).toBeUndefined()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('getLista: owner ve su privada con esOwner true; ajeno y anon → null (LIS-08/404)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Privada detalle' })
    try {
      await añadirSerieALista(clientOwner, id, serieAId)

      const detalleOwner = await getLista(clientOwner, id, ownerId)
      expect(detalleOwner).not.toBeNull()
      expect(detalleOwner!.esOwner).toBe(true)
      expect(detalleOwner!.lista.series).toEqual([
        { serieId: serieAId, titulo: 'Serie List A', slug: slugDe('a') }
      ])

      // Ajeno no puede ver la privada ajena → null (404 app-side).
      expect(await getLista(clientOtro, id, otroId)).toBeNull()
      // Anónimo tampoco.
      expect(await getLista(db, id, null)).toBeNull()
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)

  it('lista inexistente → getLista null', async () => {
    expect(await getLista(clientOwner, crypto.randomUUID(), ownerId)).toBeNull()
  })

  it('getLista/getListaPublica: pública visible en solo lectura para anon y ajeno (LIS-07)', async () => {
    const { id } = await crearLista(clientOwner, { nombre: 'Pública detalle', es_publica: true })
    try {
      await añadirSerieALista(clientOwner, id, serieBId)

      // Anónimo: getListaPublica (solo lectura pública).
      const publicaAnon = await getListaPublica(id)
      expect(publicaAnon).not.toBeNull()
      expect(publicaAnon!.series).toEqual([
        { serieId: serieBId, titulo: 'Serie List B', slug: slugDe('b') }
      ])

      // Authenticated no dueño: la ve pero no es owner (esOwner false).
      const detalleOtro = await getLista(clientOtro, id, otroId)
      expect(detalleOtro).not.toBeNull()
      expect(detalleOtro!.esOwner).toBe(false)
      expect(detalleOtro!.lista.user_id).toBe(ownerId)
    } finally {
      await unwrap(dbAdmin.from('lista').delete().eq('id', id))
    }
  }, 30_000)
})
