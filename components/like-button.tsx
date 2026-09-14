'use client'

import { useState, useTransition } from 'react'
import { ThumbsUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { accionToggleLike } from '@/lib/likes-actions'

export interface LikeButtonProps {
  reseñaId: string
  serieSlug: string
  reseñaPageId?: string
  numLikesInicial: number
  yaDisteLikeInicial: boolean
  conSesion: boolean
}

export function LikeButton({
  reseñaId,
  serieSlug,
  reseñaPageId,
  numLikesInicial,
  yaDisteLikeInicial,
  conSesion
}: LikeButtonProps) {
  const [numLikes, setNumLikes] = useState(numLikesInicial)
  const [yaDisteLike, setYaDisteLike] = useState(yaDisteLikeInicial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function alternar() {
    setError(null)
    const siguiente = !yaDisteLike
    setYaDisteLike(siguiente)
    setNumLikes(numLikes + (siguiente ? 1 : -1))
    const formData = new FormData()
    formData.set('reseñaId', reseñaId)
    formData.set('serieSlug', serieSlug)
    if (reseñaPageId) formData.set('reseñaPageId', reseñaPageId)
    formData.set('accion', siguiente ? 'dar' : 'quitar')
    startTransition(async () => {
      const resultado = await accionToggleLike({}, formData)
      if (resultado.error) {
        setYaDisteLike(!siguiente)
        setNumLikes(numLikes + (siguiente ? -1 : 1))
        setError(resultado.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant={yaDisteLike ? 'outline' : 'default'}
        size="sm"
        disabled={isPending || !conSesion}
        title={!conSesion ? 'Inicia sesión para votar' : undefined}
        onClick={alternar}
      >
        <ThumbsUp
          className="size-3.5"
          fill={yaDisteLike ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
        Útil
        <span aria-label={`${numLikes} útiles`}>{numLikes}</span>
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}