import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
})

import { ERRORES_REPORTE, reportarComentario, reportarReseña, crearReporte, listMisReportes, listReportesPendientes, actualizarEstadoReporte, eliminarReporte } from '@/lib/reportes'
import type { MotivoReporte } from '@/lib/reportes'
import type { Database } from '@/types/database'
import {
  createTestUser,
  dbAdmin,
  deleteTestUser,
  requireLocalDb,
  signInTestUser,
  unwrap,
  usernameDesdeEmail
} from '../db/env'

// F028 (REP-01..03): servicios de reportes (lib/reportes.ts). Los tests usan
// clientes con sesión en memoria (signInTestUser) para el lookup del autor y
// el insert (RLS own real de reporte) y dbAdmin como service-role en las
// lecturas de verificación. NOTA: propio contenido y duplicado (REP-03) se
// validan vía columna descripcion + UNIQUE de M23.
requireLocalDb()

const TEST_PASSWORD = 'test-password-123'

let runId: number
const createdAuthUserIds: string[] = []

let userA: string
let userB: string
let clientA: SupabaseClient<Database>
let clientB: SupabaseClient<Database>
let reseñaR1: string
let reseñaR2: string
let comentarioC1: string
let serieS1: string
let episodioE1: string

function slugDe(nombre: string): string {
  return `rptsvc-${nombre}-${runId}`
}

function emailDe(nombre: string): string {
  return `rptsvc-test-${nombre}-${runId}@iswdb.local`
}

function contenido(n: number): string {
  return 'a'.repeat(n)
}

async function crearUsuario(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userId, username: usernameDesdeEmail(emailDe(nombre), userId) })
  )
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  userA = await crearUsuario('a')
  userB = await crearUsuario('b')
  clientA = await signInTestUser(emailDe('a'), TEST_PASSWORD)
  clientB = await signInTestUser(emailDe('b'), TEST_PASSWORD)

  const categoria = await unwrap(
    dbAdmin.from('categoria').insert({ nombre: `RptSvc Cat ${runId}`, slug: slugDe('cat') }).select('id').single()
  )
  const filaS1 = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie RptSvc Uno',
        slug: slugDe('s1'),
        categoria_id: categoria.id,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  const filaS2 = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie RptSvc Dos',
        slug: slugDe('s2'),
        categoria_id: categoria.id,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )

  const filaR1 = await unwrap(
    dbAdmin
      .from('reseña')
      .insert({ user_id: userA, serie_id: filaS1.id, contenido: contenido(70) })
      .select('id')
      .single()
  )
  reseñaR1 = filaR1.id
  const filaR2 = await unwrap(
    dbAdmin
      .from('reseña')
      .insert({ user_id: userA, serie_id: filaS2.id, contenido: contenido(70) })
      .select('id')
      .single()
  )
  reseñaR2 = filaR2.id

  const filaC1 = await unwrap(
    dbAdmin
      .from('comentario')
      .insert({ user_id: userA, reseña_id: reseñaR1, contenido: contenido(30) })
      .select('id')
      .single()
  )
  comentarioC1 = filaC1.id

  serieS1 = filaS1.id
  const filaE1 = await unwrap(
    dbAdmin
      .from('episodio')
      .insert({ serie_id: filaS1.id, titulo: 'Ep RptSvc Uno', numero: 1, temporada: 1, video_id: `video-ep1-${runId}` })
      .select('id')
      .single()
  )
  episodioE1 = filaE1.id
}, 120_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('serie').delete().like('slug', `rptsvc-%${runId}`))
  await unwrap(dbAdmin.from('categoria').delete().like('slug', `rptsvc-cat-%${runId}`))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('reportarReseña (REP-01)', () => {
  it('reporta una reseña ajena con motivo y descripcion → fila pendiente', async () => {
    await reportarReseña(clientB, userB, reseñaR1, 'spam', 'Descripción del spam')

    const filas = await unwrap(
      dbAdmin
        .from('reporte')
        .select('tipo, reseña_id, comentario_id, motivo, descripcion, estado, reportador_id')
        .eq('reseña_id', reseñaR1)
        .eq('reportador_id', userB)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({
      tipo: 'reseña',
      reseña_id: reseñaR1,
      comentario_id: null,
      motivo: 'spam',
      descripcion: 'Descripción del spam',
      estado: 'pendiente',
      reportador_id: userB
    })
  }, 30_000)

  it('motivo inválido → motivoInvalido (antes de tocar BD)', async () => {
    await expect(reportarReseña(clientB, userB, reseñaR2, 'falso')).rejects.toThrow(
      ERRORES_REPORTE.motivoInvalido
    )
  }, 30_000)

  it('descripcion > 500 → descripcionMuyLarga', async () => {
    await expect(reportarReseña(clientB, userB, reseñaR2, 'otro', contenido(501))).rejects.toThrow(
      ERRORES_REPORTE.descripcionMuyLarga
    )
  }, 30_000)

  it('reseña inexistente → contenidoNoEncontrado', async () => {
    await expect(
      reportarReseña(clientB, userB, '00000000-0000-0000-0000-000000000000', 'spam')
    ).rejects.toThrow(ERRORES_REPORTE.contenidoNoEncontrado)
  }, 30_000)
})

describe('reportarComentario (REP-01)', () => {
  it('reporta un comentario ajeno → fila pendiente (descripcion null si se omite)', async () => {
    await reportarComentario(clientB, userB, comentarioC1, 'ofensivo')

    const filas = await unwrap(
      dbAdmin
        .from('reporte')
        .select('tipo, reseña_id, comentario_id, motivo, descripcion, estado, reportador_id')
        .eq('comentario_id', comentarioC1)
        .eq('reportador_id', userB)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({
      tipo: 'comentario',
      reseña_id: null,
      comentario_id: comentarioC1,
      motivo: 'ofensivo',
      descripcion: null,
      estado: 'pendiente',
      reportador_id: userB
    })
  }, 30_000)

  it('comentario inexistente → contenidoNoEncontrado', async () => {
    await expect(
      reportarComentario(clientB, userB, '00000000-0000-0000-0000-000000000000', 'spam')
    ).rejects.toThrow(ERRORES_REPORTE.contenidoNoEncontrado)
  }, 30_000)
})

describe('Propio contenido y duplicado (REP-02/REP-03)', () => {
  it('reportar el propio contenido → propioContenido', async () => {
    await expect(reportarReseña(clientA, userA, reseñaR1, 'spam')).rejects.toThrow(
      ERRORES_REPORTE.propioContenido
    )
  }, 30_000)

  it('reportar dos veces lo mismo → yaReportado', async () => {
    await expect(reportarReseña(clientB, userB, reseñaR1, 'spoiler')).rejects.toThrow(
      ERRORES_REPORTE.yaReportado
    )
  }, 30_000)

  it('reportar dos veces el mismo comentario → yaReportado', async () => {
    await expect(reportarComentario(clientB, userB, comentarioC1, 'spoiler')).rejects.toThrow(
      ERRORES_REPORTE.yaReportado
    )
  }, 30_000)
})

describe('crearReporte - serie', () => {
  it('crea reporte de serie con motivo válido → fila pendiente', async () => {
    const { data, error } = await crearReporte(clientB, { tipo: 'serie', idObjetivo: serieS1, motivo: 'spam' }, userB)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.id).toBeDefined()

    const filas = await unwrap(
      dbAdmin
        .from('reporte')
        .select('tipo, serie_id, episodio_id, motivo, descripcion, estado, reportador_id')
        .eq('id', data!.id)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({
      tipo: 'serie',
      serie_id: serieS1,
      episodio_id: null,
      motivo: 'spam',
      descripcion: null,
      estado: 'pendiente',
      reportador_id: userB
    })
  }, 30_000)

  it('crea reporte de serie con descripcion → fila con texto', async () => {
    const { data, error } = await crearReporte(clientB, { tipo: 'serie', idObjetivo: serieS1, motivo: 'otro', descripcion: 'Spam masivo' }, userB)
    expect(error).toBeNull()
    expect(data).not.toBeNull()

    const filas = await unwrap(
      dbAdmin.from('reporte').select('descripcion').eq('id', data!.id)
    )
    expect(filas[0].descripcion).toBe('Spam masivo')
  }, 30_000)

  it('motivo inválido → motivoInvalido', async () => {
    const { error } = await crearReporte(clientB, { tipo: 'serie', idObjetivo: serieS1, motivo: 'falso' as unknown as MotivoReporte }, userB)
    expect(error).not.toBeNull()
    expect(error!.message).toBe(ERRORES_REPORTE.motivoInvalido)
  }, 30_000)

  it('descripcion > 500 → descripcionMuyLarga', async () => {
    const { error } = await crearReporte(clientB, { tipo: 'serie', idObjetivo: serieS1, motivo: 'spam', descripcion: contenido(501) }, userB)
    expect(error).not.toBeNull()
    expect(error!.message).toBe(ERRORES_REPORTE.descripcionMuyLarga)
  }, 30_000)
})

describe('crearReporte - episodio', () => {
  it('crea reporte de episodio con motivo válido → fila pendiente', async () => {
    const { data, error } = await crearReporte(clientB, { tipo: 'episodio', idObjetivo: episodioE1, motivo: 'spoiler' }, userB)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.id).toBeDefined()

    const filas = await unwrap(
      dbAdmin
        .from('reporte')
        .select('tipo, serie_id, episodio_id, motivo, descripcion, estado, reportador_id')
        .eq('id', data!.id)
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toEqual({
      tipo: 'episodio',
      serie_id: null,
      episodio_id: episodioE1,
      motivo: 'spoiler',
      descripcion: null,
      estado: 'pendiente',
      reportador_id: userB
    })
  }, 30_000)
})

describe('listMisReportes', () => {
  it('devuelve los reportes del usuario ordenados por created_at desc', async () => {
    const { data, error } = await listMisReportes(dbAdmin, userB)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    // Debe incluir los reportes creados por userB en esta sesión
    // Los reportes de userB deben estar presentes (reseña y comentario creados antes)
    const reportesUserB = data!.filter((r) => r.reportador_id === userB)
    expect(reportesUserB.length).toBeGreaterThan(0)
    // Orden descendente: el primero debe tener created_at >= el segundo
    if (reportesUserB.length >= 2) {
      expect(new Date(reportesUserB[0].created_at) >= new Date(reportesUserB[1].created_at)).toBe(true)
    }
  }, 30_000)
})

describe('listReportesPendientes', () => {
  it('lista reportes pendientes', async () => {
    const { data, error } = await listReportesPendientes(dbAdmin)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    // Todos deben tener estado pendiente
    for (const reporte of data!) {
      expect(reporte.estado).toBe('pendiente')
    }
    // Debe incluir los reportes creados por userB
    const tieneReportesUserB = data!.some((r) => r.reportador_id === userB)
    expect(tieneReportesUserB).toBe(true)
  }, 30_000)
})

describe('actualizarEstadoReporte', () => {
  it('actualiza estado a revisado', async () => {
    // Crear un reporte de serie para probar
    const { data: creado } = await crearReporte(clientA, { tipo: 'serie', idObjetivo: serieS1, motivo: 'spam' }, userA)
    expect(creado).not.toBeNull()
    const idReporte = creado!.id

    const { error } = await actualizarEstadoReporte(dbAdmin, idReporte, 'revisado')
    expect(error).toBeNull()

    const filas = await unwrap(
      dbAdmin.from('reporte').select('estado').eq('id', idReporte)
    )
    expect(filas[0].estado).toBe('revisado')
  }, 30_000)
})

describe('eliminarReporte', () => {
  it('elimina un reporte', async () => {
    const { data: creado } = await crearReporte(clientA, { tipo: 'serie', idObjetivo: serieS1, motivo: 'otro' }, userA)
    expect(creado).not.toBeNull()
    const idReporte = creado!.id

    const { error } = await eliminarReporte(dbAdmin, idReporte)
    expect(error).toBeNull()

    const filas = await unwrap(
      dbAdmin.from('reporte').select('id').eq('id', idReporte)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)
})