'use client'

// =====================================================================
// Página principal - Dungeon and Soccer
// --------------------------------------------------------------------
// Renderiza:
//   - Painel admin se URL contiver ?admin
//   - Montador de times caso contrário
// =====================================================================

import { useSyncExternalStore } from 'react'
import { AdminApp } from '@/components/admin/AdminApp'
import { TeamBuilderApp } from '@/components/football/TeamBuilderApp'

// ---- Hooks para ler query params da URL sem useEffect/setState ----
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  window.addEventListener('pushstate', callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener('pushstate', callback)
  }
}

function getIsAdminFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('admin')
}

// Empty snapshot for SSR (server sempre retorna false)
const ssrSnapshot = false

export default function Home() {
  const isAdmin = useSyncExternalStore(subscribe, getIsAdminFromUrl, () => ssrSnapshot)

  if (isAdmin) {
    return (
      <AdminApp
        onBack={() => {
          // Remove ?admin da URL e volta ao site principal
          const url = new URL(window.location.href)
          url.searchParams.delete('admin')
          window.history.pushState({}, '', url.toString())
          // Dispara evento para o useSyncExternalStore reagir
          window.dispatchEvent(new PopStateEvent('popstate'))
        }}
      />
    )
  }

  return <TeamBuilderApp />
}
