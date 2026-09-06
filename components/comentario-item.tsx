'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { ComentarioForm } from '@/components/comentario-form'
import { Button } from '@/components/ui/button'
import type { ComentarioPublico } from '@/lib/comentarios'
import { accionBorrarComentario } from '@/lib/comentarios-actions'

const formatoFecha = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

// Un comentario de la lista (COM-04/COM-05, "use client" justificado: estado
// de edición inline y borrado con useTransition). Solo el autor ve los botones
// Editar/Borrar (esAutor); ajeno/anon sin botones. La edición usa
// ComentarioForm en modo 'editar' (prefilled) y se colapsa al guardar o
// cancelar; el borrado es llamada directa a la action con useTransition.
export function ComentarioItem({
  comentario,
  reseñaId,
  esAutor
}: {
  comentario: ComentarioPublico
  reseñaId: string
  esAutor: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function borrar() {
    setError(null)
    startTransition(async () => {
      const resultado = await accionBorrarComentario(reseñaId, comentario.id)
      if (resultado.error) setError(resultado.error)
    })
  }

  if (editando) {
    return (
      <li className="rounded-xl border bg-card p-4">
        <ComentarioForm
          modo="editar"
          reseñaId={reseñaId}
          comentarioId={comentario.id}
          contenidoInicial={comentario.contenido}
          onCancelar={() => setEditando(false)}
          onGuardado={() => setEditando(false)}
        />
      </li>
    )
  }

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <p className="text-sm">
          {comentario.autor.username ? (
            <Link
              href={`/usuarios/${comentario.autor.username}`}
              className="font-medium transition-colors hover:text-brand-accessible dark:hover:text-brand"
            >
              {comentario.autor.username}
            </Link>
          ) : (
            <span className="font-medium text-muted-foreground">Usuario anónimo</span>
          )}
          <span className="text-muted-foreground">
            {' · '}
            <time dateTime={comentario.created_at}>
              {formatoFecha.format(new Date(comentario.created_at))}
            </time>
          </span>
        </p>
        <p className="whitespace-pre-wrap text-sm">{comentario.contenido}</p>
      </div>
      {esAutor ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={borrar}
            className="text-destructive hover:text-destructive"
          >
            Borrar
          </Button>
          {error ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}