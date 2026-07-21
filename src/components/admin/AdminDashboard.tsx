'use client'

// =====================================================================
// AdminDashboard - Painel administrativo principal
// --------------------------------------------------------------------
// Funcionalidades:
//   - Estatísticas (total jogadores, fontes externas habilitadas)
//   - Lista jogadores do banco local com busca, paginação e delete
//   - Formulário para adicionar novo jogador
//   - Editar jogador existente (inline)
//   - Logout
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Shield, LogOut, Plus, Search, Trash2, Pencil, Users, Database, Globe,
  Save, X, ArrowLeft, Loader2, CheckCircle2,
} from 'lucide-react'
import Image from 'next/image'
import { toast } from 'sonner'

interface Player {
  id: string
  name: string
  fullName: string
  position: string
  team: string
  photoUrl: string | null
  nationality: string | null
  shirtNumber: number | null
}

interface Props {
  username: string
  onLogout: () => void
  onBack: () => void
}

const POS_LABEL: Record<string, string> = {
  GK: 'Goleiro',
  DF: 'Zagueiro',
  MF: 'Meia',
  FW: 'Atacante',
}

const emptyForm = {
  name: '',
  fullName: '',
  position: 'FW',
  team: '',
  photoUrl: '',
  nationality: '',
  shirtNumber: '',
}

export function AdminDashboard({ username, onLogout, onBack }: Props) {
  const [players, setPlayers] = useState<Player[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Form de criação
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const loadPlayers = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/players?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.ok) {
        setPlayers(data.players)
        setTotal(data.total)
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar jogadores.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlayers()
  }, [loadPlayers])

  // Debounce na busca
  useEffect(() => {
    const t = setTimeout(() => loadPlayers(search), 300)
    return () => clearTimeout(t)
  }, [search, loadPlayers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.fullName || !form.position || !form.team) {
      toast.error('Preencha os campos obrigatórios: nome, nome completo, posição e time.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          shirtNumber: form.shirtNumber ? Number(form.shirtNumber) : null,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro ao criar jogador.')
        return
      }
      toast.success(`${form.name} adicionado ao banco!`)
      setForm(emptyForm)
      loadPlayers(search)
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao criar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover "${name}" do banco de dados?`)) return
    try {
      const res = await fetch(`/api/admin/players?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro ao remover.')
        return
      }
      toast.success(`${name} removido.`)
      loadPlayers(search)
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao remover.')
    }
  }

  const startEdit = (p: Player) => {
    setEditingId(p.id)
    setEditForm({
      name: p.name,
      fullName: p.fullName,
      position: p.position,
      team: p.team,
      photoUrl: p.photoUrl || '',
      nationality: p.nationality || '',
      shirtNumber: p.shirtNumber ? String(p.shirtNumber) : '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(emptyForm)
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/players?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          shirtNumber: editForm.shirtNumber ? Number(editForm.shirtNumber) : null,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro ao atualizar.')
        return
      }
      toast.success('Jogador atualizado!')
      cancelEdit()
      loadPlayers(search)
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao atualizar.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    onLogout()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900 text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-emerald-900/50 bg-gray-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight sm:text-lg">
                Dungeon and Soccer · Admin
              </h1>
              <p className="text-[11px] text-emerald-300">
                Logado como <strong>{username}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Ver site</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Estatísticas */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-emerald-900/50 bg-gray-900/60">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-900/50">
                <Database className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{total}</div>
                <div className="text-xs text-gray-400">Jogadores no banco local</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-900/50 bg-gray-900/60">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-900/50">
                <Globe className="h-6 w-6 text-sky-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">3 fontes</div>
                <div className="text-xs text-gray-400">TheSportsDB + Wikipedia + Local</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-900/50 bg-gray-900/60">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-900/50">
                <Users className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">∞</div>
                <div className="text-xs text-gray-400">Jogadores mundiais buscáveis</div>
              </div>
            </CardContent>
          </Card>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Form de criação */}
          <Card className="border-emerald-900/50 bg-gray-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Plus className="h-5 w-5 text-emerald-400" />
                Adicionar jogador
              </CardTitle>
              <CardDescription className="text-gray-400">
                Adiciona ao banco local. Será exibido nas buscas junto com resultados externos.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Nome curto *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Neymar Jr"
                    required
                    className="border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Nome completo *</Label>
                  <Input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Ex: Neymar da Silva Santos Júnior"
                    required
                    className="border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-300">Posição *</Label>
                    <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
                      <SelectTrigger className="border-gray-700 bg-gray-800 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GK">Goleiro</SelectItem>
                        <SelectItem value="DF">Zagueiro</SelectItem>
                        <SelectItem value="MF">Meia</SelectItem>
                        <SelectItem value="FW">Atacante</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-300">Nº camisa</Label>
                    <Input
                      type="number"
                      min="0"
                      max="99"
                      value={form.shirtNumber}
                      onChange={(e) => setForm({ ...form, shirtNumber: e.target.value })}
                      placeholder="10"
                      className="border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Time atual *</Label>
                  <Input
                    value={form.team}
                    onChange={(e) => setForm({ ...form, team: e.target.value })}
                    placeholder="Ex: Santos"
                    required
                    className="border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">Nacionalidade</Label>
                  <Input
                    value={form.nationality}
                    onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                    placeholder="Ex: Brasil"
                    className="border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-300">URL da foto</Label>
                  <Input
                    value={form.photoUrl}
                    onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                    placeholder="https://..."
                    className="border-gray-700 bg-gray-800 text-white placeholder-gray-500 focus:border-emerald-500"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar
                </Button>
              </CardContent>
            </form>
          </Card>

          {/* Lista de jogadores */}
          <Card className="border-emerald-900/50 bg-gray-900/60 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-white">
                <span className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-400" />
                  Jogadores no banco
                </span>
                <Badge className="bg-emerald-600 text-white">{total} registros</Badge>
              </CardTitle>
              <CardDescription className="text-gray-400">
                Edite ou remova jogadores do banco local.
              </CardDescription>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou time..."
                  className="border-gray-700 bg-gray-800 pl-9 text-white placeholder-gray-500 focus:border-emerald-500"
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">Carregando...</span>
                </div>
              ) : players.length === 0 ? (
                <div className="py-10 text-center text-gray-500">
                  <Users className="mx-auto mb-2 h-10 w-10 opacity-30" />
                  <p className="text-sm">Nenhum jogador encontrado.</p>
                </div>
              ) : (
                <ScrollArea className="h-[560px] pr-2">
                  <ul className="space-y-2">
                    {players.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-lg border border-gray-800 bg-gray-800/50 p-2"
                      >
                        {editingId === p.id ? (
                          // Modo edição
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                placeholder="Nome"
                                className="border-gray-700 bg-gray-900 text-white"
                              />
                              <Input
                                value={editForm.team}
                                onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
                                placeholder="Time"
                                className="border-gray-700 bg-gray-900 text-white"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Select
                                value={editForm.position}
                                onValueChange={(v) => setEditForm({ ...editForm, position: v })}
                              >
                                <SelectTrigger className="border-gray-700 bg-gray-900 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="GK">Goleiro</SelectItem>
                                  <SelectItem value="DF">Zagueiro</SelectItem>
                                  <SelectItem value="MF">Meia</SelectItem>
                                  <SelectItem value="FW">Atacante</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                value={editForm.shirtNumber}
                                onChange={(e) => setEditForm({ ...editForm, shirtNumber: e.target.value })}
                                placeholder="Nº"
                                className="border-gray-700 bg-gray-900 text-white"
                              />
                            </div>
                            <Input
                              value={editForm.photoUrl}
                              onChange={(e) => setEditForm({ ...editForm, photoUrl: e.target.value })}
                              placeholder="URL foto"
                              className="border-gray-700 bg-gray-900 text-white"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveEdit(p.id)}
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                <Save className="h-3.5 w-3.5" />
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEdit}
                                className="text-gray-300 hover:bg-gray-700"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // Modo visualização
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-gray-700 bg-gray-700">
                              {p.photoUrl && (
                                <Image
                                  src={p.photoUrl}
                                  alt={p.name}
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                  unoptimized
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-white">
                                  {p.name}
                                </span>
                                {p.shirtNumber && (
                                  <span className="rounded bg-gray-700 px-1 text-[10px] text-gray-300">
                                    #{p.shirtNumber}
                                  </span>
                                )}
                                <Badge
                                  variant="outline"
                                  className="border-emerald-700 bg-emerald-900/30 px-1 text-[10px] text-emerald-300"
                                >
                                  {p.position}
                                </Badge>
                              </div>
                              <div className="truncate text-xs text-gray-400">
                                {p.fullName} · {p.team}
                                {p.nationality ? ` · ${p.nationality}` : ''}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(p)}
                                className="h-8 w-8 p-0 text-sky-400 hover:bg-sky-950"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(p.id, p.name)}
                                className="h-8 w-8 p-0 text-red-400 hover:bg-red-950"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info box */}
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <strong className="text-emerald-300">Busca em tempo real ativa.</strong> Os usuários do
            site podem buscar <strong>qualquer jogador do mundo</strong> — os resultados vêm da
            TheSportsDB (mundial) + Wikipedia + banco local. Os registros que você adicionar aqui
            aparecerão junto com os externos.
          </div>
        </div>
      </main>
    </div>
  )
}
