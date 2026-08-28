'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  accionCrearReseña,
  accionEditarReseña,
  type ReseñaActionState
} from '@/lib/reseñas-actions'

const MINIMO = 50
const MAXIMO = 2000
const ESTADO_INICIAL: ReseñaActionState = {}

export interface ReseñaFormProps {
  serieSlug: string
  conSesion: boolean
  haValorado: boolean
  reseñaPropia: { id: string; contenido: string } | null
}

// Formulario de reseñas de la ficha (RES-05/RES-06, "use client" justificado:
// useActionState + contador de caracteres). Cuatro estados: sin sesión → link
// AUTH-06; sesión sin valoración → mensaje + ancla al selector; con valoración
// y sin reseña → creación; con reseña propia → edición inline.
export function ReseñaForm({ serieSlug, conSesion, haValorado, reseñaPropia }: ReseñaFormProps) {
  // Sin sesión: link a /login conservando la ruta de vuelta y el mensaje
  // (AUTH-06); el banner lo pinta la página de login (patrón rating-selector).
  if (!conSesion) {
    const params = new URLSearchParams({
      next: `/series/${serieSlug}`,
      msg: 'Debes iniciar sesión para reseñar'
    })
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?${params.toString()}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Inicia sesión para reseñar
        </Link>
      </p>
    )
  }

  // RES-06: con sesión pero sin valoración previa no hay form; ancla al
  // selector de la sección Valoraciones (id del h2 existente).
  if (!haValorado) {
    return (
      <p className="text-sm text-muted-foreground">
        Debes valorar la serie antes de reseñarla.{' '}
        <a
          href="#valoraciones-heading"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Ir al selector de valoración
        </a>
      </p>
    )
  }

  // key: fuerza el remount al cambiar entre creación ('nueva') y edición (id
  // de la reseña). Sin él, el useState de contenido y el state de la action
  // sobreviven a la transición (p. ej. tras eliminar la reseña propia el
  // textarea conservaría el texto borrado).
  return (
    <ReseñaFormInner
      key={reseñaPropia?.id ?? 'nueva'}
      serieSlug={serieSlug}
      reseñaPropia={reseñaPropia}
    />
  )
}

// Creación/edición en un componente aparte: los hooks (useActionState,
// useState) no pueden ir tras los early returns de ReseñaForm.
function ReseñaFormInner({
  serieSlug,
  reseñaPropia
}: {
  serieSlug: string
  reseñaPropia: { id: string; contenido: string } | null
}) {
  const editando = reseñaPropia !== null
  // Bind de la server action: useActionState recibe (state, formData).
  const [state, formAction, pending] = useActionState(
    editando
      ? accionEditarReseña.bind(null, serieSlug, reseñaPropia.id)
      : accionCrearReseña.bind(null, serieSlug),
    ESTADO_INICIAL
  )
  const [contenido, setContenido] = useState(reseñaPropia?.contenido ?? '')

  return (
    <form action={formAction} className="max-w-2xl space-y-3">
      <div className="space-y-2">
        <Label htmlFor="resena-contenido">{editando ? 'Edita tu reseña' : 'Tu reseña'}</Label>
        <Textarea
          id="resena-contenido"
          name="contenido"
          value={contenido}
          onChange={(event) => setContenido(event.target.value)}
          minLength={MINIMO}
          maxLength={MAXIMO}
          rows={5}
          placeholder={`¿Qué te ha parecido la serie? (mínimo ${MINIMO} caracteres)`}
          required
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {contenido.length}/{MAXIMO} caracteres (mínimo {MINIMO})
        </p>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Publicar reseña'}
      </Button>
    </form>
  )
}
