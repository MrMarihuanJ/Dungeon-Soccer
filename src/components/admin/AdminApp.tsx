'use client'

// =====================================================================
// AdminApp - Orquestra login <-> dashboard
// --------------------------------------------------------------------
// Verifica sessão ao montar. Se autenticado, mostra dashboard.
// Caso contrário, mostra formulário de login.
// =====================================================================

import { useEffect, useState } from 'react'
import { AdminLogin } from './AdminLogin'
import { AdminDashboard } from './AdminDashboard'
import { Loader2 } from 'lucide-react'

interface Props {
  onBack: () => void
}

type Status = 'checking' | 'logged_out' | 'logged_in'

export function AdminApp({ onBack }: Props) {
  const [status, setStatus] = useState<Status>('checking')
  const [username, setUsername] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setStatus('logged_out')
          return
        }
        const data = await res.json()
        if (data?.ok && data?.user?.username) {
          if (!cancelled) {
            setUsername(data.user.username)
            setStatus('logged_in')
          }
        } else {
          if (!cancelled) setStatus('logged_out')
        }
      } catch {
        if (!cancelled) setStatus('logged_out')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          <p className="text-sm text-gray-300">Verificando sessão...</p>
        </div>
      </div>
    )
  }

  if (status === 'logged_in') {
    return (
      <AdminDashboard
        username={username}
        onLogout={() => {
          setUsername('')
          setStatus('logged_out')
        }}
        onBack={onBack}
      />
    )
  }

  return (
    <AdminLogin
      onSuccess={(u) => {
        setUsername(u)
        setStatus('logged_in')
      }}
      onBack={onBack}
    />
  )
}
