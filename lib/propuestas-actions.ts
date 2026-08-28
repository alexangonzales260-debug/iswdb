'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { crearPropuesta, ERRORES_PROPUESTA } from './propuestas'
import { createAuthClient } from './auth'

export interface PropuestaActionState {
  error?: string
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof Error ? error.message : porDefecto
}

function campoTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre)
  return typeof valor === 'string' ? valor : ''
}

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

function propuestaDatosDesdeFormData(formData: FormData): {
  titulo: string
  descripcion: string
  categoria: string
  proponente_email: string | null
  playlist_url: string | null
  canales: { handle: string; rol: 'principal' | 'colaborador' | 'invitado' }[]
} {
  const proponenteEmail = campoTexto(formData, 'proponente_email')
  const playlistUrl = campoTexto(formData, 'playlist_url')

  return {
    titulo: campoTexto(formData, 'titulo'),
    descripcion: campoTexto(formData, 'descripcion'),
    categoria: campoTexto(formData, 'categoria'),
    proponente_email: proponenteEmail === '' ? null : proponenteEmail,
    playlist_url: playlistUrl === '' ? null : playlistUrl,
    canales: campoJsonArray(formData, 'canales') as { handle: string; rol: 'principal' | 'colaborador' | 'invitado' }[]
  }
}

export async function accionProponerSerie(
  prevState: PropuestaActionState,
  formData: FormData
): Promise<PropuestaActionState> {
  const client = await createAuthClient()
  try {
    await crearPropuesta(client, propuestaDatosDesdeFormData(formData))
  } catch (error) {
    return { error: mensajeError(error, ERRORES_PROPUESTA.datosInvalidos) }
  }
  revalidatePath('/admin')
  redirect('/propuesta-enviada')
}