'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  aprobarSerie,
  crearSerie,
  editarSerie,
  ERRORES_ADMIN,
  rechazarSerie,
  requireMod,
  type SerieDatos
} from './admin'
import { createAuthClient, getUser } from './auth'

export interface AdminActionState {
  error?: string
}

// ADM-04: guard común de todas las actions. notFound() dentro de una Server
// Action sirve un 404 HTTP al invocador (Next 16: action-handler convierte el
// digest NEXT_HTTP_ERROR_FALLBACK;404 en res.statusCode = 404); no se revela
// la existencia del panel ni se redirige a /login.
async function clienteMod() {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user)
  return client
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof Error ? error.message : porDefecto
}

// ADM-02: aprueba una serie pendiente. La lógica de negocio (update + RLS
// is_admin_or_mod) vive en lib/admin.ts; la action solo orquesta: guard →
// servicio → revalidación. revalidatePath('/', 'layout') porque la serie pasa
// a ser visible en home, /series, categorías y búsqueda (consistente F009).
export async function accionAprobarSerie(slug: string): Promise<AdminActionState> {
  const client = await clienteMod()
  try {
    await aprobarSerie(client, slug)
  } catch (error) {
    return { error: mensajeError(error, 'No se pudo aprobar la serie') }
  }
  revalidatePath('/', 'layout')
  return {}
}

// ADM-03: rechaza una serie. Mismo patrón que accionAprobarSerie.
export async function accionRechazarSerie(slug: string): Promise<AdminActionState> {
  const client = await clienteMod()
  try {
    await rechazarSerie(client, slug)
  } catch (error) {
    return { error: mensajeError(error, 'No se pudo rechazar la serie') }
  }
  revalidatePath('/', 'layout')
  return {}
}

// Los formularios envían '' para los campos opcionales vacíos; los numéricos
// se convierten aquí ('' → null, basura → NaN que Zod rechaza).
function campoTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre)
  return typeof valor === 'string' ? valor : ''
}

function campoNumero(formData: FormData, nombre: string): number | null {
  const valor = campoTexto(formData, nombre)
  if (valor === '') return null
  return Number(valor)
}

// Canales y episodios viajan como JSON en inputs ocultos (T5). JSON inválido
// o no-array → []: Zod valida el contenido elemento a elemento.
function campoJsonArray(formData: FormData, nombre: string): unknown[] {
  const valor = campoTexto(formData, nombre)
  if (!valor) return []
  try {
    const parsed: unknown = JSON.parse(valor)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// El estado y los arrays se castean al tipo del servicio: la validación real
// la hace schemaSerie (Zod) dentro de crearSerie/editarSerie. Un estado
// manipulado o un canal/episodio malformado caen ahí con mensaje amigable.
function serieDatosDesdeFormData(formData: FormData): SerieDatos {
  return {
    titulo: campoTexto(formData, 'titulo'),
    descripcion: campoTexto(formData, 'descripcion'),
    categoria: campoTexto(formData, 'categoria'),
    estado: campoTexto(formData, 'estado') as SerieDatos['estado'],
    anio_inicio: campoNumero(formData, 'anio_inicio'),
    anio_fin: campoNumero(formData, 'anio_fin'),
    playlist_url: campoTexto(formData, 'playlist_url'),
    portada_url: campoTexto(formData, 'portada_url'),
    canales: campoJsonArray(formData, 'canales') as SerieDatos['canales'],
    episodios: campoJsonArray(formData, 'episodios') as SerieDatos['episodios']
  }
}

// ADM-05: crea una serie. Para useActionState: en fallo devuelve { error }
// (el formulario lo pinta sin navegar); en éxito revalida y redirect('/admin').
// redirect() lanza: debe quedar fuera del try/catch.
export async function accionCrearSerie(
  prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const client = await clienteMod()
  try {
    await crearSerie(client, serieDatosDesdeFormData(formData))
  } catch (error) {
    return { error: mensajeError(error, ERRORES_ADMIN.datosInvalidos) }
  }
  revalidatePath('/', 'layout')
  redirect('/admin')
}

// ADM-06: edita una serie (slug inmutable, pasado por bind desde la página).
// Mismo contrato que accionCrearSerie.
export async function accionEditarSerie(
  slug: string,
  prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const client = await clienteMod()
  try {
    await editarSerie(client, slug, serieDatosDesdeFormData(formData))
  } catch (error) {
    return { error: mensajeError(error, ERRORES_ADMIN.datosInvalidos) }
  }
  revalidatePath('/', 'layout')
  redirect('/admin')
}
