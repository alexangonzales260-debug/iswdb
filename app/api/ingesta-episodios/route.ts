import { NextRequest, NextResponse } from 'next/server'

import { createAuthClient, getUser } from '@/lib/auth'
import { getRolUsuario } from '@/lib/admin'
import { createServiceRoleClient } from '@/lib/supabase'
import { ingestNuevosEpisodios } from '@/lib/ingesta-episodios'

// T2 · F030: endpoint de ingesta de episodios (solo server).
//
// Autenticación (una de las dos vías):
//   1. Bearer token == process.env.CRON_SECRET (invocación desde cron).
//   2. Sesión activa de admin/mod (guard equivalente a requireMod, pero sin
//      notFound(): una API devuelve 401, no 404, ante cualquier fallo de auth).
//
// Nunca se loguea el token, el secret ni ningún valor de entorno.

function autorizadoPorToken(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authorization = request.headers.get('authorization')
  if (!authorization) return false
  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false
  return token === secret
}

async function autorizadoPorSesion(): Promise<boolean> {
  try {
    const client = await createAuthClient()
    const user = await getUser()
    if (!user) return false
    const rol = await getRolUsuario(client, user.id)
    return rol === 'mod' || rol === 'admin'
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const autorizado = autorizadoPorToken(request) || (await autorizadoPorSesion())
  if (!autorizado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const client = createServiceRoleClient()
    const resumenes = await ingestNuevosEpisodios(client)

    const resumen = resumenes.reduce(
      (acc, r) => {
        acc.procesadas += r.procesados
        acc.creadas += r.creados
        acc.omitidas += r.omitidos
        if (r.errores.length > 0) acc.errores.push(...r.errores)
        return acc
      },
      { procesadas: 0, creadas: 0, omitidas: 0, errores: [] as string[] }
    )

    return NextResponse.json(resumen, { status: 200 })
  } catch {
    // ingestNuevosEpisodios lanza (query de series, cliente service-role, etc.).
    // 500 genérico: sin trazas, sin secretos.
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}