'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  accionAprobarSugerencia,
  accionEliminarSugerencia,
  accionRechazarSugerencia
} from '@/lib/episodio-deteccion-actions'

// Botones de acción sobre una sugerencia de episodio (SUG-03/04, "use client"
// justificado: estado de transición y error). Patrón idéntico a
// moderation-buttons.tsx y reporte-actions.tsx.
export function SugerenciaActions({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar(accion: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const resultado = await accion()
      if (resultado.error) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => ejecutar(() => accionAprobarSugerencia(id))}
          aria-label="Aprobar sugerencia"
        >
          Aprobar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => ejecutar(() => accionRechazarSugerencia(id))}
          aria-label="Rechazar sugerencia"
        >
          Rechazar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => ejecutar(() => accionEliminarSugerencia(id))}
          aria-label="Eliminar sugerencia"
        >
          Eliminar
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
