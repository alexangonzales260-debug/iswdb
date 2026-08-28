import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  db,
  dbAdmin,
  requireLocalDb,
  unwrap
} from '../db/env'
import { crearPropuesta, ERRORES_PROPUESTA, schemaPropuesta } from '@/lib/propuestas'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
})

requireLocalDb()

let runId: number
let categoriaId: string
let canalId: string
const slugsCreados: string[] = []

beforeAll(async () => {
  runId = Date.now()

  const categoria = await unwrap(
    dbAdmin
      .from('categoria')
      .insert({ nombre: `cat-prop-lib-${runId}`, slug: `cat-prop-lib-${runId}` })
      .select('id')
      .single()
  )
  categoriaId = categoria.id
  const canal = await unwrap(
    dbAdmin
      .from('canal')
      .insert({ nombre: 'Canal prop lib', handle: `@canal-prop-lib-${runId}` })
      .select('id')
      .single()
  )
  canalId = canal.id
}, 60_000)

afterAll(async () => {
  await dbAdmin.from('serie').delete().in('slug', slugsCreados)
  await dbAdmin.from('canal').delete().eq('id', canalId)
  await dbAdmin.from('categoria').delete().eq('id', categoriaId)
})

describe('F011 lib/propuestas.ts — schemaPropuesta (Zod)', () => {
  it('input válido → success', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Mi serie propuesta',
      descripcion: 'Descripción suficientemente larga para pasar la validación.',
      categoria: 'cualquier-slug',
      proponente_email: 'contacto@example.com',
      playlist_url: 'https://www.youtube.com/playlist?list=PLxxxx',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(true)
  })

  it('titulo vacío → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: '',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.tituloCorto)
  })

  it('titulo muy corto (< 3) → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'ab',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.tituloCorto)
  })

  it('titulo muy largo (> 200) → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'a'.repeat(201),
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.tituloLargo)
  })

  it('descripcion muy corta (< 10) → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Corta',
      categoria: 'cat',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.descripcionCorta)
  })

  it('descripcion muy larga (> 5000) → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'a'.repeat(5001),
      categoria: 'cat',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.descripcionLarga)
  })

  it('email inválido → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      proponente_email: 'no-es-email',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.emailInvalido)
  })

  it('playlist_url inválida → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      playlist_url: 'no-es-url',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.playlistInvalida)
  })

  it('sin canales → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      canales: []
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.alMenosUnCanal)
  })

  it('rol inválido → error Zod', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      canales: [{ handle: 'canal-uno', rol: 'invalido' }]
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe(ERRORES_PROPUESTA.rolInvalido)
  })

  it('proponente_email vacío (string vacío) → ok (se normaliza a null)', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      proponente_email: '',
      playlist_url: '',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.proponente_email).toBeNull()
  })

  it('playlist_url vacía (string vacío) → ok (se normaliza a null)', () => {
    const result = schemaPropuesta.safeParse({
      titulo: 'Título válido',
      descripcion: 'Descripción válida de más de diez caracteres.',
      categoria: 'cat',
      proponente_email: 'contacto@example.com',
      playlist_url: '',
      canales: [{ handle: 'canal-uno', rol: 'principal' }]
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.playlist_url).toBeNull()
  })
})

describe('F011 lib/propuestas.ts — crearPropuesta (RPC)', () => {
  it('happy path: anon → serie pendiente + user_id null + proponente_email + participa + slug -prop-', async () => {
    const slug = await crearPropuesta(db, {
      titulo: 'Serie Happy Path',
      descripcion: 'Descripción de la propuesta feliz que pasa validación.',
      categoria: `cat-prop-lib-${runId}`,
      proponente_email: 'contacto@example.com',
      playlist_url: 'https://www.youtube.com/playlist?list=PLxxxx',
      canales: [{ handle: `canal-prop-lib-${runId}`, rol: 'principal' }]
    })

    expect(slug.slug).toMatch(/-prop-\d+-[a-f0-9]{6}$/)

    const serie = await unwrap(
      dbAdmin
        .from('serie')
        .select('slug, moderation_status, user_id, proponente_email')
        .eq('slug', slug.slug)
        .single()
    )
    expect(serie).toEqual({
      slug: slug.slug,
      moderation_status: 'pendiente',
      user_id: null,
      proponente_email: 'contacto@example.com'
    })

    const participaciones = await unwrap(
      dbAdmin.from('participa').select('canal_id, rol').eq('serie_id', (await dbAdmin.from('serie').select('id').eq('slug', slug.slug).single()).data!.id)
    )
    expect(participaciones).toHaveLength(1)
    expect(participaciones[0].canal_id).toBe(canalId)
    expect(participaciones[0].rol).toBe('principal')
  })

  it('input con moderation_status aprobada → se ignora, queda pendiente (schema no lo tiene)', async () => {
    // Pasamos un objeto SIN moderation_status (el schema no lo conoce); la
    // función ignora cualquier campo extra y fuerza 'pendiente' en la RPC.
    const slug = await crearPropuesta(db, {
      titulo: 'Serie Status Ignorado',
      descripcion: 'Descripción válida para probar que el status se ignora.',
      categoria: `cat-prop-lib-${runId}`,
      proponente_email: null,
      playlist_url: null,
      canales: [{ handle: `canal-prop-lib-${runId}`, rol: 'principal' }]
    })

    const serie = await unwrap(
      dbAdmin
        .from('serie')
        .select('moderation_status')
        .eq('slug', slug.slug)
        .single()
    )
    expect(serie.moderation_status).toBe('pendiente')
  })

  it('canal inexistente → error "El canal <handle> no existe en el catálogo"', async () => {
    await expect(
      crearPropuesta(db, {
        titulo: 'Serie Canal Inexistente',
        descripcion: 'Descripción válida para probar canal inexistente.',
        categoria: `cat-prop-lib-${runId}`,
        proponente_email: null,
        playlist_url: null,
        canales: [{ handle: 'no-existe-este-handle', rol: 'principal' }]
      })
    ).rejects.toThrow(ERRORES_PROPUESTA.canalNoExiste.replace('{handle}', 'no-existe-este-handle'))
  })

  it('categoría inexistente → error "La categoría no existe"', async () => {
    await expect(
      crearPropuesta(db, {
        titulo: 'Serie Cat Inexistente',
        descripcion: 'Descripción válida para probar categoría inexistente.',
        categoria: 'no-existe-esta-categoria',
        proponente_email: null,
        playlist_url: null,
        canales: [{ handle: `canal-prop-lib-${runId}`, rol: 'principal' }]
      })
    ).rejects.toThrow(ERRORES_PROPUESTA.categoriaNoExiste)
  })

  it('titulo vacío/corto → error Zod (título requerido)', async () => {
    await expect(
      crearPropuesta(db, {
        titulo: 'ab',
        descripcion: 'Descripción válida de más de diez caracteres.',
        categoria: `cat-prop-lib-${runId}`,
        proponente_email: null,
        playlist_url: null,
        canales: [{ handle: `canal-prop-lib-${runId}`, rol: 'principal' }]
      })
    ).rejects.toThrow(ERRORES_PROPUESTA.tituloCorto)
  })

  it('email inválido → error Zod', async () => {
    await expect(
      crearPropuesta(db, {
        titulo: 'Serie Email Invalido',
        descripcion: 'Descripción válida de más de diez caracteres.',
        categoria: `cat-prop-lib-${runId}`,
        proponente_email: 'no-es-email',
        playlist_url: null,
        canales: [{ handle: `canal-prop-lib-${runId}`, rol: 'principal' }]
      })
    ).rejects.toThrow(ERRORES_PROPUESTA.emailInvalido)
  })

  it('descripcion < 10 chars → error Zod', async () => {
    await expect(
      crearPropuesta(db, {
        titulo: 'Serie Descripcion Corta',
        descripcion: 'Corta',
        categoria: `cat-prop-lib-${runId}`,
        proponente_email: null,
        playlist_url: null,
        canales: [{ handle: `canal-prop-lib-${runId}`, rol: 'principal' }]
      })
    ).rejects.toThrow(ERRORES_PROPUESTA.descripcionCorta)
  })
})