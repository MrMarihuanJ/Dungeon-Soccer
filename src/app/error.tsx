'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ErrorBoundary]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 p-6 text-center text-white">
      <div className="max-w-md">
        <h2 className="mb-3 text-2xl font-bold text-red-400">❌ Erro inesperado</h2>
        <p className="mb-4 text-sm text-gray-400">
          Ocorreu um erro ao carregar esta página. Tente novamente.
        </p>
        <p className="mb-6 text-xs text-gray-500 font-mono break-all">
          {error.message || 'Erro desconhecido'}
        </p>
        <button
          onClick={() => reset()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-700"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
