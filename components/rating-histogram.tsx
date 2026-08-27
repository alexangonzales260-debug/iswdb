import { getDistribucionNotas } from '@/lib/valoraciones'

// Histograma de notas de la ficha (VAL-04, RSC puro): barras horizontales
// 10→1 con conteo, ancho proporcional al máximo. Con 0 votos en total muestra
// el estado vacío; las notas sin votos dentro de una serie valorada pintan la
// barra vacía. Lectura pública con cliente anon (D11).
export async function RatingHistogram({ serieId }: { serieId: string }) {
  const distribucion = await getDistribucionNotas(serieId)
  const total = distribucion.reduce((suma, entrada) => suma + entrada.count, 0)

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Sin valoraciones todavía</p>
  }

  const maximo = Math.max(...distribucion.map((entrada) => entrada.count))

  return (
    <ul className="space-y-1.5" aria-label="Distribución de valoraciones">
      {distribucion.map(({ nota, count }) => {
        const ancho = maximo > 0 ? (count / maximo) * 100 : 0
        return (
          <li
            key={nota}
            aria-label={`${nota} estrellas: ${count} votos`}
            className="grid grid-cols-[1.5rem_1fr_2.5rem] items-center gap-2 text-sm"
          >
            <span className="text-right tabular-nums text-muted-foreground">{nota}</span>
            <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-brand" style={{ width: `${ancho}%` }} />
            </div>
            <span className="tabular-nums text-muted-foreground">{count}</span>
          </li>
        )
      })}
    </ul>
  )
}
