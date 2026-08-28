import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SerieForm } from '@/components/admin/serie-form'
import { getSerieParaEditar } from '@/lib/admin'
import { accionEditarSerie } from '@/lib/admin-actions'
import { createAuthClient } from '@/lib/auth'
import { listCanales } from '@/lib/canales'
import { getCategorias } from '@/lib/categorias'

export const dynamic = 'force-dynamic'

interface EditarSeriePageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: EditarSeriePageProps): Promise<Metadata> {
  const { slug } = await params
  const client = await createAuthClient()
  const serie = await getSerieParaEditar(client, slug)
  // Slug inexistente → título neutro; el 404 efectivo lo lanza la página
  // (algunos runtimes ignoran notFound() en generateMetadata, patrón FIC-04).
  if (!serie) return { title: 'Serie no encontrada' }
  return { title: `Editar: ${serie.titulo}` }
}

// ADM-06: formulario de edición precargado. Slug inexistente → notFound()
// (ADM-04: un no-mod nunca llega aquí, el guard corre en el layout). El slug
// es inmutable: viaja por bind hacia accionEditarSerie, no por el formulario.
export default async function EditarSeriePage({ params }: EditarSeriePageProps) {
  const { slug } = await params
  const client = await createAuthClient()
  const [serie, categorias, canales] = await Promise.all([
    getSerieParaEditar(client, slug),
    getCategorias(),
    listCanales()
  ])
  if (!serie) notFound()

  return (
    <section aria-labelledby="editar-serie">
      <h2 id="editar-serie" className="text-lg font-semibold tracking-tight">
        Editar: {serie.titulo}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        El slug no se puede cambiar.
      </p>
      <div className="mt-6">
        <SerieForm
          action={accionEditarSerie.bind(null, serie.slug)}
          categorias={categorias}
          canales={canales}
          submitLabel="Guardar cambios"
          inicial={{
            titulo: serie.titulo,
            descripcion: serie.descripcion ?? '',
            categoria: serie.categoria?.slug ?? '',
            // El CHECK de serie.estado garantiza que el valor es uno de los dos.
            estado: serie.estado as 'activa' | 'finalizada',
            anio_inicio: serie.anio_inicio,
            anio_fin: serie.anio_fin,
            playlist_url: serie.playlist_url ?? '',
            portada_url: serie.portada_url ?? '',
            canales: serie.canales.map((canal) => ({
              canal_id: canal.canal_id,
              rol: canal.rol as 'principal' | 'colaborador' | 'invitado'
            })),
            episodios: serie.episodios
          }}
        />
      </div>
    </section>
  )
}
