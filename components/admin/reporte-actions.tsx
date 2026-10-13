'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { accionActualizarEstadoReporte, accionEliminarReporte } from '@/lib/reportes-actions'

// Botones de acción sobre un reporte (REP-04/05, "use client" justificado:
// estado de transición y error). Patrón idéntico a moderation-buttons.tsx.
export function ReporteActions({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function ejecutar(accion: () => Promise<{ error?: string; success?: boolean }>) {
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
          onClick={() => ejecutar(() => accionActualizarEstadoReporte(id, 'revisado'))}
          aria-label="Marcar como revisado"
        >
          Revisado
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => ejecutar(() => accionActualizarEstadoReporte(id, 'descartado'))}
          aria-label="Marcar como descartado"
        >
          Descartado
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => ejecutar(() => accionEliminarReporte(id))}
          aria-label="Eliminar reporte"
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
