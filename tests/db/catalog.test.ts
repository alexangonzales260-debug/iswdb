import { beforeAll, describe, expect, it } from 'vitest'
import { dbAdmin, requireLocalDb, unwrap } from './env'

requireLocalDb()

// Las invariantes de esquema (unique/check) se prueban con service_role:
// las constraints se aplican a cualquier rol y la escritura de catálogo
// no está concedida a anon (MOD-05).
beforeAll(async () => {
  await unwrap(dbAdmin.from('participa').delete().not('serie_id', 'is', null))
  for (const table of ['episodio', 'serie', 'canal', 'categoria']) {
    await unwrap(dbAdmin.from(table).delete().not('id', 'is', null))
  }
})

async function seedCategoria(nombre: string, slug: string): Promise<string> {
  const row = await unwrap(dbAdmin.from('categoria').insert({ nombre, slug }).select('id').single())
  return row.id
}

async function seedCanal(handle: string): Promise<string> {
  const row = await unwrap(
    dbAdmin.from('canal').insert({ nombre: `Canal ${handle}`, handle }).select('id').single()
  )
  return row.id
}

async function seedSerie(slug: string): Promise<string> {
  const categoriaId = await seedCategoria(`cat-${slug}`, slug)
  const row = await unwrap(
    dbAdmin
      .from('serie')
      .insert({ titulo: `Serie ${slug}`, slug, categoria_id: categoriaId })
      .select('id')
      .single()
  )
  return row.id
}

async function seedEpisodio(serieId: string, numero: number, videoId: string): Promise<string> {
  const row = await unwrap(
    dbAdmin
      .from('episodio')
      .insert({ serie_id: serieId, numero, titulo: `Episodio ${videoId}`, video_id: videoId })
      .select('id')
      .single()
  )
  return row.id
}

describe('M1 catálogo — invariants', () => {
  it('categoria: slug duplicado → error de BD', async () => {
    await seedCategoria('Cat Minecraft', 'minecraft')
    await expect(
      unwrap(dbAdmin.from('categoria').insert({ nombre: 'Cat Minecraft 2', slug: 'minecraft' }))
    ).rejects.toThrow(/duplicate key/)
  })

  it('serie: slug duplicado → error de BD', async () => {
    const categoriaId = await seedCategoria('cat-slug-dup', 'gta')
    await unwrap(
      dbAdmin.from('serie').insert({ titulo: 'Serie A', slug: 'slug-dup', categoria_id: categoriaId })
    )
    await expect(
      unwrap(
        dbAdmin
          .from('serie')
          .insert({ titulo: 'Serie B', slug: 'slug-dup', categoria_id: categoriaId })
      )
    ).rejects.toThrow(/duplicate key/)
  })

  it('canal: handle duplicado → error de BD', async () => {
    await seedCanal('handle-dup')
    await expect(
      unwrap(dbAdmin.from('canal').insert({ nombre: 'Canal B', handle: 'handle-dup' }))
    ).rejects.toThrow(/duplicate key/)
  })

  it('episodio: UNIQUE(serie_id, temporada, numero) → error de BD', async () => {
    const serieId = await seedSerie('ep-num')
    await seedEpisodio(serieId, 1, 'vid-num-1')
    await expect(
      unwrap(
        dbAdmin.from('episodio').insert({
          serie_id: serieId,
          temporada: 1,
          numero: 1,
          titulo: 'Episodio repetido',
          video_id: 'vid-num-2'
        })
      )
    ).rejects.toThrow(/duplicate key/)
  })

  it('episodio: UNIQUE(serie_id, video_id) → error de BD', async () => {
    const serieId = await seedSerie('ep-vid')
    await seedEpisodio(serieId, 1, 'vid-dup')
    await expect(
      unwrap(
        dbAdmin.from('episodio').insert({
          serie_id: serieId,
          temporada: 1,
          numero: 2,
          titulo: 'Episodio repetido',
          video_id: 'vid-dup'
        })
      )
    ).rejects.toThrow(/duplicate key/)
  })

  it('serie: estado fuera de CHECK → error de BD', async () => {
    const categoriaId = await seedCategoria('cat-estado', 'roleplay')
    await expect(
      unwrap(
        dbAdmin.from('serie').insert({
          titulo: 'Serie C',
          slug: 'estado-invalido',
          categoria_id: categoriaId,
          estado: 'emision'
        })
      )
    ).rejects.toThrow(/check constraint/)
  })

  it('serie: moderation_status fuera de CHECK → error de BD', async () => {
    const categoriaId = await seedCategoria('cat-moderacion', 'anime')
    await expect(
      unwrap(
        dbAdmin.from('serie').insert({
          titulo: 'Serie D',
          slug: 'moderacion-invalida',
          categoria_id: categoriaId,
          moderation_status: 'publicada'
        })
      )
    ).rejects.toThrow(/check constraint/)
  })

  it('participa: rol fuera de CHECK → error de BD', async () => {
    const serieId = await seedSerie('participa-rol')
    const canalId = await seedCanal('canal-rol')
    await expect(
      unwrap(
        dbAdmin.from('participa').insert({ serie_id: serieId, canal_id: canalId, rol: 'amigo' })
      )
    ).rejects.toThrow(/check constraint/)
  })

  it('serie: anio_fin < anio_inicio con ambos presentes → error de BD', async () => {
    const categoriaId = await seedCategoria('cat-anios', 'terror')
    await expect(
      unwrap(
        dbAdmin.from('serie').insert({
          titulo: 'Serie E',
          slug: 'anios-invalidos',
          categoria_id: categoriaId,
          anio_inicio: 2020,
          anio_fin: 2019
        })
      )
    ).rejects.toThrow(/check constraint/)
  })
})
