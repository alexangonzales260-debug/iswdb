'use client'

import { useActionState, useEffect, useRef, useState } from 'react'

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
// (prefilled dentro de comentario-item, con cancelar). El _prev tecleado se
// conserva tras publicar (la lista se refresca por revalidatePath de la
// action), mismo criterio que ReseñaForm. El borde pending→false sin error
// detecta el fin del submit: en modo editar avisa a comentario-item para
// colapsar el form (onGuardado); en modo crear no hace falta limpiar nada.
export function ComentarioForm({
  reseñaId,
  modo,
  comentarioId,
  contenidoInicial = '',
  onCancelar,
  onGuardado
}: ComentarioFormProps) {
  const [state, formAction, pending] = useActionState(
    modo === 'editar' && comentarioId
      ? accionEditarComentario.bind(null, reseñaId, comentarioId)
      : accionCrearComentario.bind(null, reseñaId),
    ESTADO_INICIAL
  )
  const [contenido, setContenido] = useState(contenidoInicial)
  const prevPending = useRef(pending)

  useEffect(() => {
    const termino = prevPending.current && !pending
    prevPending.current = pending
    if (modo === 'editar' && termino && !state.error) onGuardado?.()
  }, [pending, state.error, modo, onGuardado])

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        {modo === 'editar' ? (
          <Label htmlFor="comentario-contenido">Edita tu comentario</Label>
        ) : null}
        <Textarea
          id="comentario-contenido"
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