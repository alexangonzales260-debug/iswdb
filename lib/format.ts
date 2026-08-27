import type { SerieRating } from './series'

const ETIQUETAS_ROL: Record<string, string> = {
  principal: 'Principal',
  colaborador: 'Colaborador',
  invitado: 'Invitado'
}

// Etiqueta visible de rol (FIC-05, CAN-02): capitalizada; un rol desconocido
// se muestra tal cual.
export function etiquetaRol(rol: string): string {
  return ETIQUETAS_ROL[rol] ?? rol
}

// Texto de valoración para tarjetas y ficha: AVG a 1 decimal + conteo, o
// "Sin valoraciones" con 0 notas. La UI muestra AVG por transparencia
// (VAL-06); el WR solo ordena los rankings (lib/series.ts).
export function ratingTexto(rating: SerieRating | null): string {
  if (!rating) return 'Sin valoraciones'
  const { average, count } = rating
  return `${average.toFixed(1)} · ${count} ${count === 1 ? 'valoración' : 'valoraciones'}`
}

// Meta description de la ficha (FIC-08): trunca a max caracteres con elipsis,
// sin dejar espacios colgantes antes del corte.
export function truncateDescripcion(texto: string | null, max = 160): string {
  if (!texto) return ''
  const limpio = texto.trim()
  if (limpio.length <= max) return limpio
  return `${limpio.slice(0, max - 1).trimEnd()}…`
}
