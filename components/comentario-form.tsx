'use client'

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  accionCrearComentario,
  accionEditarComentario,
  type ComentarioActionState
} from '@/lib/comentarios-actions'

const MAXIMO = 1000
const ESTADO_INICIAL: ComentarioActionState = {}

export interface ComentarioFormProps {
  reseñaId: string
  modo: 'crear' | 'editar'
  comentarioId?: string
  contenidoInicial?: string
  onCancelar?: () => void
  onGuardado?: () => void
}

// Formulario de comentarios (COM-01/COM-02, "use client" justificado:
// useActionState + contador de caracteres). Modo 'crear' (página) o 'editar'
// (prefilled dentro de comentario-item, con cancelar). El borde pending→false
// sin error detecta el fin del submit: en modo editar avisa a comentario-item
// para colapsar el form (onGuardado); en modo crear limpia el textarea para
// que el siguiente comentario empiece en blanco (sin reload, el campo queda
// listo para un nuevo POST).
export function ComentarioForm({
  reseñaId,
  modo,
  comentarioId,
  contenidoInicial = '',
  onCancelar,
  onGuardado
}: ComentarioFormProps) {
  const id = useId()
  const textareaId = modo === 'editar' ? `comentario-contenido-${comentarioId}` : `comentario-contenido-nuevo-${id}`

  const action = useMemo(
    () =>
      modo === 'editar' && comentarioId
        ? accionEditarComentario.bind(null, reseñaId, comentarioId)
        : accionCrearComentario.bind(null, reseñaId),
    [modo, reseñaId, comentarioId]
  )
  const [state, formAction, pending] = useActionState(action, ESTADO_INICIAL)
  const [contenido, setContenido] = useState(contenidoInicial)
  const prevPending = useRef(pending)

  useEffect(() => {
    const termino = prevPending.current && !pending
    prevPending.current = pending
    if (!termino || state.error) return
    if (modo === 'editar') onGuardado?.()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setContenido('')
  }, [pending, state.error, modo, onGuardado])

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        {modo === 'editar' ? (
          <Label htmlFor={textareaId}>Edita tu comentario</Label>
        ) : null}
        <Textarea
          id={textareaId}
          name="contenido"
          value={contenido}
          onChange={(event) => setContenido(event.target.value)}
          maxLength={MAXIMO}
          rows={modo === 'editar' ? 3 : 4}
          placeholder={modo === 'editar' ? undefined : 'Escribe un comentario…'}
          autoFocus={modo === 'editar'}
          required
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {contenido.length}/{MAXIMO} caracteres
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? modo === 'editar'
              ? 'Guardando…'
              : 'Publicando…'
            : modo === 'editar'
            ? 'Guardar'
            : 'Comentar'}
        </Button>
        {modo === 'editar' && onCancelar ? (
          <Button type="button" variant="ghost" onClick={onCancelar} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  )
}