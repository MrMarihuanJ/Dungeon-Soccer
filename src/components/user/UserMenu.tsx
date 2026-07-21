'use client'

// =====================================================================
// UserMenu - Menu de usuário com login/register/logout
// =====================================================================

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  User as UserIcon, LogIn, LogOut, UserPlus, Save, Loader2, Mail,
  CheckCircle2, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

interface UserInfo {
  id: string
  username: string
  email: string
  displayName?: string
}

interface Props {
  onTeamSave?: () => Promise<boolean>
  onTeamLoad?: (team: { formation: string; starters: any; reserves: any }) => void
}

export function UserMenu({ onTeamSave, onTeamLoad }: Props) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setChecking(false)
          return
        }
        const data = await res.json()
        if (!cancelled && data?.ok && data?.user) {
          setUser(data.user)
        }
      } catch {
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Falha no login.')
        return
      }
      setUser(data.user)
      setModalOpen(false)
      setLoginIdentifier('')
      setLoginPassword('')
      toast.success(`Bem-vindo, ${data.user.displayName || data.user.username}!`)
      if (onTeamLoad) {
        const teamRes = await fetch('/api/user/team', { cache: 'no-store' })
        if (teamRes.ok) {
          const teamData = await teamRes.json()
          if (teamData?.ok && teamData.team) onTeamLoad(teamData.team)
        }
      }
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          email: regEmail,
          password: regPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Falha no cadastro.')
        return
      }
      setUser(data.user)
      setModalOpen(false)
      setRegUsername('')
      setRegEmail('')
      setRegPassword('')
      toast.success(`Conta criada! Bem-vindo, ${data.user.username}!`)
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/user/logout', { method: 'POST' })
    } catch {}
    setUser(null)
    toast.info('Você saiu. Até logo!')
  }

  const handleSaveTeam = async () => {
    if (!onTeamSave) return
    const ok = await onTeamSave()
    if (ok) toast.success('Time salvo na sua conta!')
    else toast.error('Erro ao salvar time.')
  }

  const handleLoadTeam = async () => {
    if (!onTeamLoad) return
    try {
      const res = await fetch('/api/user/team', { cache: 'no-store' })
      const data = await res.json()
      if (data?.ok && data.team) {
        onTeamLoad(data.team)
        toast.success('Time carregado do servidor!')
      } else {
        toast.info('Você ainda não tem time salvo.')
      }
    } catch {
      toast.error('Erro ao carregar time.')
    }
  }

  const initials = (user?.displayName || user?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (checking) {
    return (
      <Button variant="ghost" size="sm" disabled className="h-9 w-9 p-0">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  if (!user) {
    return (
      <>
        <Button
          variant="default"
          size="sm"
          onClick={() => setModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <LogIn className="h-4 w-4" />
          <span className="hidden sm:inline">Entrar</span>
        </Button>

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <UserIcon className="h-5 w-5" />
                Sua conta Dungeon and Soccer
              </DialogTitle>
              <DialogDescription>
                Entre para salvar seu time em qualquer dispositivo, ou crie uma conta grátis.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">
                  <LogIn className="h-4 w-4" />
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="register">
                  <UserPlus className="h-4 w-4" />
                  Criar conta
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="login-identifier">Email ou usuário</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-identifier"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="voce@email.com ou @usuario"
                        required
                        className="pl-9"
                        autoComplete="username"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="reg-username">Nome de usuário</Label>
                    <Input
                      id="reg-username"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="ex: cartoleiro_brasil"
                      required
                      minLength={3}
                      maxLength={30}
                      pattern="[a-zA-Z0-9_.\-]+"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Letras, números, _ . - (3-30 caracteres)
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="voce@email.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reg-password">Senha</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="mínimo 6 caracteres"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Criar conta grátis
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>Senhas são armazenadas com hash scrypt. Nunca compartilhamos seus dados.</span>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-1 transition-all hover:ring-2 hover:ring-emerald-500/40 focus:outline-none">
          <Avatar className="h-8 w-8 border-2 border-emerald-500">
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-xs font-bold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-semibold">{user.displayName || user.username}</span>
            <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSaveTeam} className="cursor-pointer">
          <Save className="h-4 w-4 text-emerald-500" />
          Salvar time
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLoadTeam} className="cursor-pointer">
          <CheckCircle2 className="h-4 w-4 text-sky-500" />
          Carregar time
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-700">
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
