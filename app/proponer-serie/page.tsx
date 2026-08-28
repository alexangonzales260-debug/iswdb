import type { Metadata } from 'next'

import { PropuestaForm } from '@/components/propuesta-form'
import { getCategorias } from '@/lib/categorias'
import { EmptyState } from '@/components/empty-state'
import { FolderPlus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Proponer serie · ISWDB',
  description: 'Propon una nueva serie para el catálogo de ISWDB. No requiere registro.'
}

export default async function ProponerSeriePage() {
  const categorias = await getCategorias()

  return (
    <section aria-labelledby="proponer-serie" className="flex flex-col gap-6 max-w-3xl mx-auto">
      <header>
        <h1 id="proponer-serie" className="text-2xl font-semibold tracking-tight">
          Proponer una serie
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rellena el formulario y la propuesta entrará en la cola de moderación.
          No es necesario registrarse.
        </p>
      </header>

      {categorias.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={FolderPlus}
            title="No hay categorías disponibles"
            description="No se puede proponer una serie sin categorías. Contacta con el equipo."
          />
        </div>
      ) : (
        <div className="mt-6">
          <PropuestaForm categorias={categorias} />
        </div>
      )}
    </section>
  )
}