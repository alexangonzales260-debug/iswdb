import { supabaseServer } from './supabase'

export interface CategoriaChip {
  nombre: string
  slug: string
}

export async function getCategorias(): Promise<CategoriaChip[]> {
  const { data, error } = await supabaseServer
    .from('categoria')
    .select('nombre, slug')
    .order('nombre', { ascending: true })

  if (error) throw new Error(`getCategorias: ${error.message}`)
  return data
}
