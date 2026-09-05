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

// M14 (F021): columna username en public.usuario (NOT NULL + UNIQUE + CHECK).
// - Backfill derivó el username del email desnormalizado (M6) con la regla
//   única (unaccent → minúsculas → colapso a '_' → trim → slice 13 →
//   '-' || primeros 6 hex del id).
// - RLS intacto (verificación de plan): usuario es own-only (M7) sin grant
//   para anon (M2) y usuario_serie es own-only (M11); la lectura cross-user
//   del perfil público irá por service_role (D25). Estos tests son la
//   regresión que lo blinda.
// Esta migración hace que los inserts de usuario SIN username fallen (23502);
// los servicios/app y helpers de test que insertan la fila deben rellenarlo
// (T2).

requireLocalDb()

const TEST_PASSWORD = 'test-password-123'
const USERNAME_RE = /^[a-z0-9_-]{3,20}$/
const createdAuthUserIds: string[] = []

let runId: number
let categoriaId: string
let serieAId: string

let userIdA: string
let userIdB: string
let emailA: string
let emailB: string
let usernameA: string
let idD: string
let idE: string
let emailD: string
let emailE: string
let clientA: SupabaseClient<Database>

function emailDe(nombre: string): string {
  return `usr-test-${nombre}-${runId}@iswdb.local`
}

// Mirror en TS de la regla única del backfill de M14 (la misma que aplicará
// lib/auth.ts en registrarUsuario/asegurarFilaUsuario en T2).
function usernameDesdeEmail(email: string, userId: string): string {
  const base =
    (email.split('@')[0] ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 13) || 'usuario'
  return `${base}-${userId.replaceAll('-', '').slice(0, 6)}`
}

async function crearParaInsertar(nombre: string): Promise<string> {
  const userId = await createTestUser(emailDe(nombre), TEST_PASSWORD)
  createdAuthUserIds.push(userId)
  return userId
}

beforeAll(async () => {
  runId = Date.now()

  // GoTrue en frío (tras supabase start/reset): se templa con un usuario.
  const warmupId = await createTestUser(emailDe('warmup'), TEST_PASSWORD)
  await deleteTestUser(warmupId)

  // Usuarios A y B con fila en public.usuario (username explícito con la
  // regla única; el insert sin username ya está bloqueado por NOT NULL).
  emailA = emailDe('a')
  userIdA = await crearParaInsertar('a')
  usernameA = usernameDesdeEmail(emailA, userIdA)
  await unwrap(
    dbAdmin.from('usuario').insert({ id: userIdA, email: emailA, username: usernameA })
  )

  emailB = emailDe('b')
  userIdB = await crearParaInsertar('b')
  await unwrap(
    dbAdmin.from('usuario').insert({
      id: userIdB,
      email: emailB,
      username: usernameDesdeEmail(emailB, userIdB)
    })
  )

  // Usuarios dedicados a los casos que no deben crear fila (unique y check
  // fallan a propósito).
  emailD = emailDe('duplicado')
  idD = await crearParaInsertar('duplicado')
  emailE = emailDe('malformato')
  idE = await crearParaInsertar('malformato')

  clientA = await signInTestUser(emailA, TEST_PASSWORD)

  // Fixture de serie para la regresión de RLS de usuario_serie.
  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `Usr Cat ${runId}`, slug: `usr-cat-${runId}` })
      .select('id')
      .single()
  )
  categoriaId = categoria.id
  const serie = await unwrap(
    dbAdmin
      .from('serie')
      .insert({
        titulo: 'Serie Usr',
        slug: `usr-serie-${runId}`,
        categoria_id: categoria.id,
        moderation_status: 'aprobada'
      })
      .select('id')
      .single()
  )
  serieAId = serie.id

  // B sigue serieA: objetivo de la regresión del RLS own de usuario_serie.
  await unwrap(
    dbAdmin.from('usuario_serie').insert({ usuario_id: userIdB, serie_id: serieAId })
  )
}, 60_000)

afterAll(async () => {
  await unwrap(dbAdmin.from('usuario_serie').delete().eq('serie_id', serieAId))
  await unwrap(dbAdmin.from('serie').delete().eq('id', serieAId))
  await unwrap(dbAdmin.from('categoria').delete().eq('id', categoriaId))
  for (const id of createdAuthUserIds) {
    await deleteTestUser(id)
  }
})

describe('M14 invariantes — username', () => {
  it('backfill: toda fila tiene username NOT NULL, formato válido y único', async () => {
    // Invariante que la migración garantiza para cualquier fila (poblada en
    // el backfill o por la app): not null, ^[a-z0-9_-]{3,20}$ y sin duplicados.
    const filas = await unwrap(dbAdmin.from('usuario').select('username'))
    expect(filas.length).toBeGreaterThanOrEqual(2)
    const usernames = filas.map((f) => f.username)
    expect(usernames.every((u) => u !== null && USERNAME_RE.test(u))).toBe(true)
    expect(new Set(usernames).size).toBe(usernames.length)
  }, 30_000)

  it('username duplicado → 23505 (UNIQUE)', async () => {
    await expect(
      unwrap(
        dbAdmin
          .from('usuario')
          .insert({ id: idD, email: emailD, username: usernameA })
      )
    ).rejects.toThrow(/duplicate key/i)
  }, 30_000)

  it('username con formato inválido → 23514 (CHECK)', async () => {
    // Mayúsculas fuera de ^[a-z0-9_-]{3,20}$ (la app almacena siempre en
    // minúsculas; el CHECK blinda la BD).
    await expect(
      unwrap(
        dbAdmin
          .from('usuario')
          .insert({ id: idE, email: emailE, username: 'Invalido' })
      )
    ).rejects.toThrow(/check constraint/i)
  }, 30_000)
})

describe('M14 RLS — regresión (M7/M11 intactos)', () => {
  it('anon: no puede SELECT usuario (ni email ni username ajeno)', async () => {
    await expect(
      unwrap(db.from('usuario').select('username').limit(1))
    ).rejects.toThrow(/permission denied/i)
  }, 30_000)

  it('autenticado ajeno: 0 filas en usuario del otro (M7 usuario_select_own)', async () => {
    const filas = await unwrap(
      clientA.from('usuario').select('id').eq('id', userIdB)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)

  it('autenticado ajeno: 0 filas en usuario_serie del otro (M11 select-own)', async () => {
    const filas = await unwrap(
      clientA.from('usuario_serie').select('serie_id').eq('usuario_id', userIdB)
    )
    expect(filas).toHaveLength(0)
  }, 30_000)
})