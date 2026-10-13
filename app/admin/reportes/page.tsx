import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { Inbox } from 'lucide-react'

import { ReporteActions } from '@/components/admin/reporte-actions'
import { requireMod } from '@/lib/admin'
import { createAuthClient, getUser } from '@/lib/auth'
import { listReportesPendientes } from '@/lib/reportes'

// F028 (REP-04): cola de reportes para moderadores. requireMod en el layout
// ya cubre la autenticación; aquí se obtiene la lista con el cliente de auth.
export const dynamic = 'force-dynamic'

const ETIQUETA_TIPO: Record<string, string> = {
  serie: 'Serie',
  episodio: 'Episodio',
  reseña: 'Reseña',
  comentario: 'Comentario'
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  revisado: 'Revisado',
  descartado: 'Descartado'
}

const VARIANTE_ESTADO: Record<string, 'secondary' | 'outline' | 'destructive' | 'ghost'> = {
  pendiente: 'outline',
  revisado: 'secondary',
  descartado: 'destructive'
}

const formatoFecha = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

// Muestra el título del contenido reportado según el tipo. Como no hacemos
// enrichment on-read (solo la ID está disponible), mostramos el ID abreviado.
function objetivoTexto(reporte: {
  tipo: string
  serie_id: string | null
  episodio_id: string | null
  reseña_id: string | null
  comentario_id: string | null
}): string {
  const id =
    reporte.serie_id ??
    reporte.episodio_id ??
    reporte.reseña_id ??
    reporte.comentario_id ??
    '?'
  return `${ETIQUETA_TIPO[reporte.tipo] ?? reporte.tipo} · ${id.slice(0, 8)}…`
}

export default async function AdminReportesPage() {
  const client = await createAuthClient()
  const user = await getUser()
  await requireMod(client, user ?? null)

  const { data: reportes, error } = await listReportesPendientes(client)
  if (error) notFound()
  const lista = reportes ?? []

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-lg font-semibold tracking-tight">Reportes pendientes</h2>

      {lista.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No hay reportes pendientes"
          description="Cuando un usuario reporte contenido, los reportes aparecerán aquí."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {lista.map((reporte) => (
            <li key={reporte.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ETIQUETA_TIPO[reporte.tipo] ?? reporte.tipo}</Badge>
                  <Badge variant={VARIANTE_ESTADO[reporte.estado] ?? 'outline'}>
                    {ETIQUETA_ESTADO[reporte.estado] ?? reporte.estado}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatoFecha.format(new Date(reporte.created_at))}
                  </span>
                </div>
                <p className="truncate text-sm font-medium">{objetivoTexto(reporte)}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{reporte.motivo}</p>
                {reporte.descripcion ? (
                  <p className="text-xs text-muted-foreground">{reporte.descripcion}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Reportado por: {reporte.reportador_id.slice(0, 8)}…
                </p>
              </div>
              <ReporteActions id={reporte.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
