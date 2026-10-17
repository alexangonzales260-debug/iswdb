import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { dbAdmin, requireLocalDb, unwrap, createTestUser, deleteTestUser } from '../db/env'
import { detectarPatronEpisodio, crearSugerencia, listSugerenciasPendientes, aprobarSugerencia, rechazarSugerencia } from '../../lib/episodio-deteccion'
import type { SupabaseClient } from '@supabase/supabase-js'

requireLocalDb()

describe('episodio-deteccion lógica', () => {
  it('detecta SXXEXX', () => {
    expect(detectarPatronEpisodio('Serie S01E05 Título')).toEqual({ temporada: 1, numero: 5, titulo: 'Título' })
  })
  it('detecta XxXX', () => {
    expect(detectarPatronEpisodio('Serie 2x10 Título')).toEqual({ temporada: 2, numero: 10, titulo: 'Título' })
  })
  it('detecta Capítulo X', () => {
    expect(detectarPatronEpisodio('Serie - Capítulo 3')).toEqual({ temporada: 1, numero: 3, titulo: 'Serie' })
  })
})

describe('episodio-deteccion DB', () => {
  let runId: number
  let serieId: string
  let clientMod: SupabaseClient
  let modId: string

  beforeAll(async () => {
    runId = Date.now()

    // Usuario: `sug` + runId elimina colisiones con categorías/seres existentes
    modId = await createTestUser(`sug-mod-${runId}@iswdb.local`, 'password123')
    await unwrap(dbAdmin.from('usuario').insert({ id: modId, rol: 'mod', username: `mod-${runId}` }))
    clientMod = dbAdmin

    const cat = await unwrap(dbAdmin.from('categoria').insert({ nombre: `Sug Cat ${runId}`, slug: `sug-cat-${runId}` }).select('id').single())
    const serie = await unwrap(dbAdmin.from('serie').insert({ titulo: `Serie Sug ${runId}`, slug: `sug-serie-${runId}`, categoria_id: cat.id, moderation_status: 'aprobada' }).select('id').single())
    serieId = serie.id
  })

  afterAll(async () => {
    await unwrap(dbAdmin.from('serie').delete().eq('id', serieId))
    await deleteTestUser(modId)
  })

  it('crear y aprobar sugerencia crea episodio', async () => {
    await crearSugerencia(clientMod, {
      serie_id: serieId,
      video_id_youtube: 'vid1',
      titulo_detectado: 'Ep 1',
      temporada_detectada: 1,
      numero_detectado: 1
    })

    const pendientes = await listSugerenciasPendientes(clientMod)
    expect(pendientes).toHaveLength(1)

    await aprobarSugerencia(clientMod, pendientes[0].id)

    const { data } = await dbAdmin.from('episodio').select('id').eq('video_id', 'vid1').single()
    expect(data).toBeDefined()
  })

  it('rechazar sugerencia no crea episodio', async () => {
    await crearSugerencia(clientMod, {
      serie_id: serieId,
      video_id_youtube: 'vid2',
      titulo_detectado: 'Ep 2',
      temporada_detectada: 1,
      numero_detectado: 2
    })
    const p = await listSugerenciasPendientes(clientMod)
    await rechazarSugerencia(clientMod, p[0].id)

    const { data } = await dbAdmin.from('episodio').select('id').eq('video_id', 'vid2')
    expect(data).toHaveLength(0)
  })
})