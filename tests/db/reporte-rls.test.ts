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

// F028 (REP-01..08): tabla reporte (M22) + RLS en crudo.
// M22 define reporte (reportador_id FK usuario cascade · tipo
// discriminador · FK parcial al contenido con CHECK de consistencia ·
// motivo 1-2000 · estado pendiente/revisado/descartado default pendiente ·
// created_at). RLS flag 5 APROBADO: reporte_insert_own (with check
// reportador_id = auth.uid()), reporte_select_own_or_mod (using
// reportador_id = auth.uid() OR public.is_admin_or_mod()),
// reporte_update_mod (using/with check public.is_admin_or_mod()) y
// reporte_delete_mod (using public.is_admin_or_mod()). SIN políticas de
// update/delete para el reportador own: update/delete de CUALQUIER fila
// por un no-mod (incluida la propia) → 0 filas. Sin políticas anon
// (REPORT-02). Los servicios (lib/reportes.ts) se cubren en T2; aquí se
// ejercitan las policies directamente con clientes anon / de sesión.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

// Usuario normal que reporta (insert propio ok).
let reportadorId: string
let clientReportador: SupabaseClient<Database>
// Otro usuario normal (no debe tocar filas ajenas ni la propia en update/delete).
let otroId: string
let clientOtro: SupabaseClient<Database>
// Mod (debe poder update/delete cualquier reporte).
let modId: string
let clientMod: SupabaseClient<Database>

// Objetivos reales del reporte (FK con cascade).
let serieId: string
let episodioId: string
let reseñaId: string
let comentarioId: string

function emailDe(nombre: string): string {
  return `reporte-${nombre}-${runId}@iswdb.local`
}

function slugDe(nombre: string): string {
  return `reporte-${nombre}-${runId}`
}

// Contenido respetando los CHECK de reseña (50-2000) y comentario (1-1000).
function contenido(n: number): string {
  return 'a'.repeat(n)
}

async function crearUsuario(nombre: string, rol: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin
      .from('usuario')
      .insert({ id: userId, rol, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

// Un reporte es identificable por su motivo (único por test).
async function idReporte(motivo: string): Promise<string> {
  const fila = await unwrap(
    dbAdmin.from('reporte').select('id').eq('motivo', motivo).single()
  )
  return fila.id
}

// RLS como única barrera: anon puede tener grant o no según la ACL por
// defecto del rol que creó la tabla (hallazgo F24 T1-fix). Se aceptan
// ambas formas: error de denegación o 0 filas.
async function expectDenegadoO0Filas(
  promesa: PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<void> {
  const { data, error } = (await promesa) as { data: unknown[] | null; error: { message: string } | null }
  if (error) {
    expect(error.message).toMatch(/permission denied|row-level security/i)
  } else {
    expect(data ?? []).toHaveLength(0)
  }
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), 'user')
  await deleteTestUser(warmupId)

  reportadorId = await crearUsuario('reportador', 'user')
  otroId = await crearUsuario('otro', 'user')
  modId = await crearUsuario('mod', 'mod')
  clientReportador = await signInTestUser(emailDe('reportador'), TEST_PASSWORD)
  clientOtro = await signInTestUser(emailDe('otro'), TEST_PASSWORD)
  clientMod = await signInTestUser(emailDe('mod'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Reporte Cat ${runId}`, slug: slugDe('cat') })
      .select('id')
      .single()
  )
  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Reporte',
        slug: slugDe('serie'),
        categoria_id: categoria.id,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  serieId = serie.id
  const episodio = await unwrap(
    dbAdmin
      .from('episodio')
      .insert({ serie_id: serieId, temporada: 1, numero: 1, titulo: 'Ep Reporte', video_id: `video-${runId}` })
      .select('id')
      .single()
  )
  episodioId = episodio.id
  const reseña = await unwrap(
    dbAdmin
      .from('reseña')
      .insert({ user_id: otroId, serie_id: serieId, contenido: contenido(70) })
      .select('id')
      .single()
  )
  reseñaId = reseña.id
  const comentario = await unwrap(
    dbAdmin
      .from('comentario')
      .insert({ reseña_id: reseñaId, user_id: reportadorId, contenido: contenido(20) })
      .select('id')
      .single()
  )
  comentarioId = comentario.id
}, 120_000)

afterAll(async () => {
  try {
    await unwrap(dbAdmin.from('usuario').delete().in('id', createdAuthUserIds))
    await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
    await unwrap(dbAdmin.from('categoria').delete().eq('slug', slugDe('cat')))
  } catch (error) {
    console.warn(`Cleanup de tests/db/reporte-rls.test.ts falló: ${(error as Error).message}`)
  }
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M22 invariantes — tabla reporte', () => {
  it('CHECK de consistencia: una FK exacta según el tipo', async () => {
    // tipo serie con serie_id + reportador_id: ok.
    await unwrap(
      dbAdmin
        .from('reporte')
        .insert({ reportador_id: reportadorId, tipo: 'serie', serie_id: serieId, motivo: 'inv-serie-ok' })
    )
    const fila = await unwrap(
      dbAdmin
        .from('reporte')
        .select('tipo, serie_id, episodio_id, reseña_id, comentario_id')
        .eq('motivo', 'inv-serie-ok')
        .single()
    )
    expect(fila).toEqual({
      tipo: 'serie',
      serie_id: serieId,
      episodio_id: null,
      reseña_id: null,
      comentario_id: null
    })
  })

  it('CHECK de consistencia: tipo serie con FK de otro tipo → rechazado', async () => {
    await expect(
      unwrap(
        dbAdmin
          .from('reporte')
          .insert({ reportador_id: reportadorId, tipo: 'serie', episodio_id: episodioId, motivo: 'inv-consistency' })
      )
    ).rejects.toThrow(/violates check constraint/i)
  })

  it('motivo vacío → rechazado (CHECK 1-2000)', async () => {
    await expect(
      unwrap(
        dbAdmin
          .from('reporte')
          .insert({ reportador_id: reportadorId, tipo: 'reseña', reseña_id: reseñaId, motivo: '' })
      )
    ).rejects.toThrow(/violates check constraint/i)
  })

  it('motivo >2000 → rechazado (CHECK 1-2000)', async () => {
    await expect(
      unwrap(
        dbAdmin
          .from('reporte')
          .insert({ reportador_id: reportadorId, tipo: 'reseña', reseña_id: reseñaId, motivo: contenido(2001) })
      )
    ).rejects.toThrow(/violates check constraint/i)
  })
})

describe('M22 RLS — anon (REPORT-02)', () => {
  it('SELECT sin política anon: 0 filas o denial', async () => {
    await expectDenegadoO0Filas(db.from('reporte').select('id').limit(1))
  })

  it('INSERT denegado (sin grant ni política anon)', async () => {
    const denial = /permission denied|row-level security/i
    await expect(
      unwrap(
        db.from('reporte').insert({ reportador_id: reportadorId, tipo: 'serie', serie_id: serieId, motivo: 'anon' })
      )
    ).rejects.toThrow(denial)
  })

  it('UPDATE/DELETE no cruzan filas (0 filas o denial)', async () => {
    await expectDenegadoO0Filas(
      db.from('reporte').update({ estado: 'revisado' }).eq('estado', 'pendiente').select()
    )
    await expectDenegadoO0Filas(db.from('reporte').delete().eq('estado', 'pendiente').select())
  })
})

describe('M22 RLS — authenticated normal', () => {
  it('insert own ok (reporte_insert_own) → with check reportador_id = auth.uid()', async () => {
    // El cliente autenticado envía reportador_id (su propio id, leído de
    // la sesión); el with check exige que coincida con auth.uid().
    await unwrap(
      clientReportador
        .from('reporte')
        .insert({ reportador_id: reportadorId, tipo: 'serie', serie_id: serieId, motivo: 'own-insert' })
    )
    const fila = await unwrap(
      dbAdmin.from('reporte').select('reportador_id').eq('motivo', 'own-insert').single()
    )
    expect(fila.reportador_id).toBe(reportadorId)
  })

  it('insert con reportador_id ajeno → denegado (with check reportador_id = auth.uid())', async () => {
    await expect(
      unwrap(
        clientOtro
          .from('reporte')
          .insert({ reportador_id: reportadorId, tipo: 'reseña', reseña_id: reseñaId, motivo: 'ajeno-insert' })
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('SELECT: solo reportes propios (reporte_select_own_or_mod)', async () => {
    // Acción de mod para tener una fila ajena visible al admin.
    const reporteMod = await unwrap(
      dbAdmin
        .from('reporte')
        .insert({ reportador_id: modId, tipo: 'episodio', episodio_id: episodioId, motivo: 'mod-reporta' })
        .select('id')
        .single()
    )
    // El reportador no ve la fila del mod (ajena).
    const ajenos = await unwrap(
      clientReportador.from('reporte').select('id').eq('motivo', 'mod-reporta')
    )
    expect(ajenos).toHaveLength(0)

    // El mod sí la ve (propia para él).
    const propiosMod = await unwrap(
      clientMod.from('reporte').select('id').eq('motivo', 'mod-reporta')
    )
    expect(propiosMod).toEqual([{ id: reporteMod.id }])
  })

  it('UPDATE ajeno → 0 filas', async () => {
    const reporteId = await idReporte('mod-reporta')
    const { data } = await clientReportador
      .from('reporte')
      .update({ estado: 'revisado' })
      .eq('id', reporteId)
      .select()
    expect(data).toHaveLength(0)
  })

  it('DELETE ajeno → 0 filas', async () => {
    const reporteId = await idReporte('mod-reporta')
    const { data } = await clientReportador
      .from('reporte')
      .delete()
      .eq('id', reporteId)
      .select()
    expect(data).toHaveLength(0)
  })

  it('UPDATE de la fila propia → 0 filas (flag 5: el reportador NO modifica su propio reporte)', async () => {
    const reporteId = await idReporte('own-insert')
    const { data } = await clientReportador
      .from('reporte')
      .update({ estado: 'revisado' })
      .eq('id', reporteId)
      .select()
    expect(data).toHaveLength(0)

    const fila = await unwrap(
      dbAdmin.from('reporte').select('estado').eq('id', reporteId).single()
    )
    expect(fila.estado).toBe('pendiente')
  })

  it('DELETE de la fila propia → 0 filas (flag 5: el reportador NO borra su propio reporte)', async () => {
    const reporteId = await idReporte('own-insert')
    const { data } = await clientReportador
      .from('reporte')
      .delete()
      .eq('id', reporteId)
      .select()
    expect(data).toHaveLength(0)

    const restantes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('id', reporteId)
    )
    expect(restantes).toHaveLength(1)
  })
})

describe('M22 RLS — mod/admin (REPORT-04/05)', () => {
  it('SELECT: mod ve todos los reportes (reporte_select_own_or_mod)', async () => {
    const todos = await unwrap(
      clientMod.from('reporte').select('id, tipo')
    )
    // Mod ve todos los reportes del run.
    expect(todos.length).toBeGreaterThanOrEqual(3)
  })

  it('UPDATE estado ok (reporte_update_mod)', async () => {
    const reporteId = await idReporte('own-insert')
    const fila = await unwrap(
      clientMod.from('reporte').update({ estado: 'revisado' }).eq('id', reporteId).select('estado').single()
    )
    expect(fila.estado).toBe('revisado')
  })

  it('DELETE ok (reporte_delete_mod)', async () => {
    const reporteId = await idReporte('mod-reporta')
    const { data } = await clientMod.from('reporte').delete().eq('id', reporteId).select()
    expect(data).toHaveLength(1)
  })
})

describe('M22 cascade — FK on delete', () => {
  it('borrar episodio → sus reportes borrados', async () => {
    await unwrap(
      dbAdmin
        .from('reporte')
        .insert({ reportador_id: reportadorId, tipo: 'episodio', episodio_id: episodioId, motivo: 'cascade-ep' })
    )
    const antes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('episodio_id', episodioId)
    )
    expect(antes.length).toBeGreaterThanOrEqual(1)

    await unwrap(dbAdmin.from('episodio').delete().eq('id', episodioId))

    const restantes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('episodio_id', episodioId)
    )
    expect(restantes).toHaveLength(0)
  })

  it('borrar comentario → sus reportes borrados', async () => {
    await unwrap(
      dbAdmin
        .from('reporte')
        .insert({ reportador_id: reportadorId, tipo: 'comentario', comentario_id: comentarioId, motivo: 'cascade-com' })
    )
    const antes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('comentario_id', comentarioId)
    )
    expect(antes.length).toBeGreaterThanOrEqual(1)

    await unwrap(dbAdmin.from('comentario').delete().eq('id', comentarioId))

    const restantes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('comentario_id', comentarioId)
    )
    expect(restantes).toHaveLength(0)
  })

  it('borrar reseña → sus reportes borrados', async () => {
    await unwrap(
      dbAdmin
        .from('reporte')
        .insert({ reportador_id: reportadorId, tipo: 'reseña', reseña_id: reseñaId, motivo: 'cascade-resena' })
    )
    const antes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('reseña_id', reseñaId)
    )
    expect(antes.length).toBeGreaterThanOrEqual(1)

    await unwrap(dbAdmin.from('reseña').delete().eq('id', reseñaId))

    const restantes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('reseña_id', reseñaId)
    )
    expect(restantes).toHaveLength(0)
  })

  it('borrar usuario → sus reportes borrados', async () => {
    const cscdId = await crearUsuario('cscd', 'user')
    await unwrap(
      dbAdmin
        .from('reporte')
        .insert({ reportador_id: cscdId, tipo: 'serie', serie_id: serieId, motivo: 'cascade-user' })
    )
    const antes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('reportador_id', cscdId)
    )
    expect(antes.length).toBeGreaterThanOrEqual(1)

    await deleteTestUser(cscdId)

    const restantes = await unwrap(
      dbAdmin.from('reporte').select('id').eq('reportador_id', cscdId)
    )
    expect(restantes).toHaveLength(0)
  })
})