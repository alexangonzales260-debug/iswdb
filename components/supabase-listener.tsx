'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import { createBrowserAuthClient } from '@/lib/supabase-browser'

export function SupabaseListener() {
  const router = useRouter()
  const client = useMemo(() => createBrowserAuthClient(), [])

  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        router.refresh()
      }
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [client, router])

  return null
}
