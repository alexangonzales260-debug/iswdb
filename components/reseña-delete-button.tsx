'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { accionEliminarReseña } from '@/lib/reseñas-actions'

// Botón de borrado por reseña (RES-04/RES-09, "use client" justificado:
// estado de transición y error). Llamada directa a la server action con
// useTransition + router.refresh() (patrón rating-selector y
// moderation-buttons): la sección es RSC y necesita un hijo cliente para el
// onClick. La visibilidad la decide la sección: dueño o mod/admin.
export function ReseñaDeleteButton({
  reseñaId,
  serieSlug
}: {
  reseñaId: string
  serieSlug: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function eliminar() {
    setError(null)
    startTransition(async () => {
      const resultado = await accionEliminarReseña(reseñaId, serieSlug)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={eliminar}
        className="text-destructive hover:text-destructive"
      >
        Eliminar
      </Button>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
