'use client'

// =====================================================================
// AdminLogin - Formulário de login do painel administrativo
// =====================================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Shield, Lock, User, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'

interface Props {
  onSuccess: (username: string) => void
  onBack: () => void
}

export function AdminLogin({ onSuccess, onBack }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Falha no login.')
        return
      }
      onSuccess(data.user.username)
    } catch (err) {
      console.error(err)
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-900/50">
            <Shield className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Dungeon and Soccer</h1>
          <p className="mt-1 text-sm text-emerald-300">Painel Administrativo</p>
        </div>

        <Card className="border-emerald-800/50 bg-gray-900/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Lock className="h-5 w-5 text-emerald-400" />
              Acesso restrito
            </CardTitle>
            <CardDescription className="text-gray-400">
              Informe suas credenciais de administrador para continuar.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">
                  Usuário
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    required
                    className="border-gray-700 bg-gray-800 pl-9 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="border-gray-700 bg-gray-800 pl-9 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/50 p-3 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3 text-xs text-emerald-300">
                <strong>💡 Credenciais padrão (dev):</strong>
                <br />
                Usuário: <code className="rounded bg-emerald-900/50 px-1">admin</code>
                <br />
                Senha: <code className="rounded bg-emerald-900/50 px-1">admin123</code>
                <br />
                <span className="mt-1 block text-emerald-400/70">
                  Em produção, defina ADMIN_USERNAME e ADMIN_PASSWORD na Vercel.
                </span>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Entrar
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                className="w-full text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao site
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
