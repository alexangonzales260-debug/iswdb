'use client'

import { useTransition, useState } from 'react'

import { Button } from '@/components/ui/button'
import { accionMarcarLeida, accionMarcarTodasLeidas } from '@/lib/notificaciones-actions'

interface MarcarLeidaIndividualProps {
  notificacionId: string
}

export function MarcarLeidaButton({ notificacionId }: MarcarLeidaIndividualProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function marcar() {
    setError(null)
    const formData = new FormData()
    formData.set('notificacionId', notificacionId)
    startTransition(async () => {
      const resultado = await accionMarcarLeida({}, formData)
      if (resultado.error) setError(resultado.error)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={marcar}>
        Marcar como leída
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function MarcarTodasLeidaButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function marcar() {
    setError(null)
    startTransition(async () => {
      const resultado = await accionMarcarTodasLeidas({}, new FormData())
      if (resultado.error) setError(resultado.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={marcar}>
        Marcar todas como leídas
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
