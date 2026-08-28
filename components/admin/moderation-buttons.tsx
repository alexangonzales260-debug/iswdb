'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { accionAprobarSerie, accionRechazarSerie } from '@/lib/admin-actions'

// Botones de moderación de la cola (ADM-02/ADM-03, "use client" justificado:
// estado de transición y error). Llamada directa a las server actions con
// useTransition (no useActionState: son botones sueltos, no un form). Tras el
// éxito, router.refresh() re-renderiza el payload RSC → la serie sale de la
// cola y el listado "Todas" actualiza su estado sin recarga (patrón
// rating-selector).
export function ModerationButtons({ slug, titulo }: { slug: string; titulo: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function moderar(accion: typeof accionAprobarSerie) {
    setError(null)
    startTransition(async () => {
      const resultado = await accion(slug)
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => moderar(accionAprobarSerie)}
          aria-label={`Aprobar ${titulo}`}
        >
          Aprobar
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => moderar(accionRechazarSerie)}
          aria-label={`Rechazar ${titulo}`}
        >
          Rechazar
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
