'use client'

import { MessageSquareText } from 'lucide-react'

import { ComentarioItem } from '@/components/comentario-item'
import { EmptyState } from '@/components/empty-state'
import type { ComentarioPublico } from '@/lib/comentarios'

// Lista de comentarios de la página de reseña (COM-04, "use client" por el
// item: hoja cliente). userId es el del usuario con sesión: los items lo usan
// para decidir si muestran Editar/Borrar (COM-05); null = anon, solo lectura.
export function ListaComentarios({
  reseñaId,
  comentarios,
  userId
}: {
  reseñaId: string
  comentarios: ComentarioPublico[]
  userId: string | null
}) {
  if (comentarios.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="Aún no hay comentarios"
        description="Sé la primera persona en comentar esta reseña."
      />
    )
  }

  return (
    <ul className="space-y-3">
      {comentarios.map((comentario) => (
        <ComentarioItem
          key={comentario.id}
          comentario={comentario}
          reseñaId={reseñaId}
          esAutor={userId !== null && comentario.autor.id === userId}
        />
      ))}
    </ul>
  )
}