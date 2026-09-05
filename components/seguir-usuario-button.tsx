'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  accionDejarDeSeguirUsuario,
  accionSeguirUsuario
} from '@/lib/sigue-usuarios-actions'

export interface SeguirUsuarioButtonProps {
  seguidoId: string
  seguidoUsername: string
  siguiendoInicial: boolean
}

export function SeguirUsuarioButton({
  seguidoId,
  seguidoUsername,
  siguiendoInicial
}: SeguirUsuarioButtonProps) {
  const [siguiendo, setSiguiendo] = useState(siguiendoInicial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function alternar() {
    setError(null)
    const siguiente = !siguiendo
    setSiguiendo(siguiente)
    const formData = new FormData()
    formData.set('seguidoId', seguidoId)
    formData.set('seguidoUsername', seguidoUsername)
    startTransition(async () => {
      const resultado = siguiente
        ? await accionSeguirUsuario({}, formData)
        : await accionDejarDeSeguirUsuario({}, formData)
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
