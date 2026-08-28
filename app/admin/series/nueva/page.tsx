import type { Metadata } from 'next'

import { SerieForm } from '@/components/admin/serie-form'
import { accionCrearSerie } from '@/lib/admin-actions'
import { listCanales } from '@/lib/canales'
import { getCategorias } from '@/lib/categorias'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nueva serie',
  description: 'Crear una serie nueva en el catálogo de iswdb.'
}

// ADM-05: formulario de creación. El guard requireMod ya corrió en el layout;
// la validación real es server-side (schemaSerie) dentro de accionCrearSerie.
export default async function NuevaSeriePage() {
  const [categorias, canales] = await Promise.all([getCategorias(), listCanales()])

  return (
    <section aria-labelledby="nueva-serie">
      <h2 id="nueva-serie" className="text-lg font-semibold tracking-tight">
        Nueva serie
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        El slug se genera automáticamente a partir del título.
      </p>
      <div className="mt-6">
        <SerieForm
          action={accionCrearSerie}
          categorias={categorias}
          canales={canales}
          submitLabel="Crear serie"
        />
      </div>
    </section>
  )
}
