import { z } from 'zod'
import { slugify } from './admin'
import { unwrap } from './series'
import type { AuthClient } from './auth'

export const ERRORES_PROPUESTA = {
  tituloRequerido: 'El título es obligatorio (3–200 caracteres)',
  tituloCorto: 'El título debe tener al menos 3 caracteres',
  tituloLargo: 'El título no puede superar 200 caracteres',
  descripcionRequerida: 'La descripción es obligatoria (10–5000 caracteres)',
  descripcionCorta: 'La descripción debe tener al menos 10 caracteres',
  descripcionLarga: 'La descripción no puede superar 5000 caracteres',
  categoriaNoExiste: 'La categoría no existe',
  emailInvalido: 'El email de contacto no es válido',
  playlistInvalida: 'La URL de la playlist no es válida',
  alMenosUnCanal: 'Debes añadir al menos un canal',
  canalNoExiste: 'El canal {handle} no existe en el catálogo',
  rolInvalido: 'El rol del canal no es válido',
  datosInvalidos: 'Revisa los datos de la propuesta'
} as const

const ROL_CANAL = ['principal', 'colaborador', 'invitado'] as const

const canalSchema = z.object({
  handle: z.string().trim().min(1, ERRORES_PROPUESTA.canalNoExiste),
  rol: z.enum(ROL_CANAL, { message: ERRORES_PROPUESTA.rolInvalido })
})

function vacioANull(valor: unknown): unknown {
  return valor === '' ? null : valor
}

export const schemaPropuesta = z
  .object({
    titulo: z.string().trim().min(3, ERRORES_PROPUESTA.tituloCorto).max(200, ERRORES_PROPUESTA.tituloLargo),
    descripcion: z.string().trim().min(10, ERRORES_PROPUESTA.descripcionCorta).max(5000, ERRORES_PROPUESTA.descripcionLarga),
    categoria: z.string().trim().min(1, ERRORES_PROPUESTA.categoriaNoExiste),
    proponente_email: z.preprocess(vacioANull, z.string().trim().email(ERRORES_PROPUESTA.emailInvalido).nullable().optional()),
    playlist_url: z.preprocess(vacioANull, z.string().trim().url(ERRORES_PROPUESTA.playlistInvalida).nullable().optional()),
    canales: z.array(canalSchema).min(1, ERRORES_PROPUESTA.alMenosUnCanal)
  })

export type PropuestaInput = {
  titulo: string
  descripcion: string
  categoria: string
  proponente_email: string | null
  playlist_url: string | null
  canales: { handle: string; rol: 'principal' | 'colaborador' | 'invitado' }[]
}

export interface PropuestaResultado {
  slug: string
}

async function categoriaPorSlug(client: AuthClient, slug: string): Promise<string> {
  const categoria = await unwrap(
    client.from('categoria').select('id').eq('slug', slug).maybeSingle()
  )
  if (!categoria) throw new Error(ERRORES_PROPUESTA.categoriaNoExiste)
  return categoria.id
}

async function resolverCanales(client: AuthClient, handles: { handle: string; rol: string }[]): Promise<{ canal_id: string; rol: string }[]> {
  const resultados: { canal_id: string; rol: string }[] = []
  for (const { handle, rol } of handles) {
    const handleNormalizado = handle.startsWith('@') ? handle : `@${handle.toLowerCase()}`
    const canal = await unwrap(
      client.from('canal').select('id').eq('handle', handleNormalizado).maybeSingle()
    )
    if (!canal) throw new Error(ERRORES_PROPUESTA.canalNoExiste.replace('{handle}', handle))
    resultados.push({ canal_id: canal.id, rol })
  }
  return resultados
}

function generarSlugPropuesta(titulo: string): string {
  const base = slugify(titulo) || 'serie'
  const ts = Date.now()
  const rand = crypto.randomUUID().slice(0, 6)
  return `${base}-prop-${ts}-${rand}`
}

export async function crearPropuesta(
  client: AuthClient,
  datos: PropuestaInput
): Promise<PropuestaResultado> {
  const parsed = schemaPropuesta.safeParse(datos)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? ERRORES_PROPUESTA.datosInvalidos)
  }

  const { titulo, descripcion, categoria, proponente_email, playlist_url, canales } = parsed.data

  const categoriaId = await categoriaPorSlug(client, categoria)
  const canalesResueltos = await resolverCanales(client, canales)
  const slug = generarSlugPropuesta(titulo)

  const { error } = await client.rpc('crear_propuesta', {
    p_titulo: titulo,
    p_descripcion: descripcion,
    p_categoria_id: categoriaId,
    p_playlist_url: (playlist_url ?? '') as string,
    p_proponente_email: (proponente_email ?? '') as string,
    p_slug: slug,
    p_canales: canalesResueltos as unknown as import('@/types/database').Json
  })

  if (error) throw new Error(error.message)

  return { slug }
}