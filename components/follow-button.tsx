'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { accionDejarDeSeguir, accionSeguir } from '@/lib/follows-actions'

export interface FollowButtonProps {
  serieId: string
  serieSlug: string
  siguiendoInicial: boolean
}

export function FollowButton({ serieId, serieSlug, siguiendoInicial }: FollowButtonProps) {
  const [siguiendo, setSiguiendo] = useState(siguiendoInicial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function alternar() {
    setError(null)
    const siguiente = !siguiendo
    setSiguiendo(siguiente)
    const formData = new FormData()
    formData.set('serieId', serieId)
    formData.set('serieSlug', serieSlug)
    startTransition(async () => {
      const resultado = siguiente
        ? await accionSeguir({}, formData)
        : await accionDejarDeSeguir({}, formData)
      if (resultado.error) {
        setSiguiendo(!siguiente)
        setError(resultado.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant={siguiendo ? 'outline' : 'default'}
        size="sm"
        disabled={isPending}
        onClick={alternar}
      >
        {siguiendo ? 'Siguiendo' : 'Seguir'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
