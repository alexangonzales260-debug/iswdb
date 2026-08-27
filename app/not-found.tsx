import Link from 'next/link'
import { Compass } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'

// 404 común de la app: lo renderiza notFound() desde cualquier ruta.
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-16">
      <EmptyState
        icon={Compass}
        title="Página no encontrada"
        description="La página que buscas no existe o ya no está disponible."
      />
      <div className="text-center">
        <Link
          href="/"
          className="text-sm font-medium text-brand-accessible underline-offset-4 hover:underline dark:text-brand"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
