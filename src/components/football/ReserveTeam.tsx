'use client'

// =====================================================================
// ReserveTeam - Painel do time reserva (modo técnico)
// --------------------------------------------------------------------
// Funcionalidades:
//   1. Listar reservas com foto, nome, posição, OVR
//   2. Substituir (reserva entra no lugar de um titular — modal abre)
//   3. Mover para o campo (reserva ocupa posição vazia — novo)
//   4. Definir posição designada no banco (benchPosition)
//   5. Remover do banco
//
// FIX C6/M1: Antes o prop `onSetBenchPosition` não era passado pelo
// TeamBuilderApp, causando crash ao mudar o Select. Agora o componente
// consome direto do store via hook, removendo a dependência de prop.
// =====================================================================

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  ArrowLeftRight,
  Trash2,
  UserCircle2,
  Shirt,
  MapPin,
  MoveToField,
  ChevronDown,
} from './icons'
import type { SelectedPlayer } from '@/lib/football/store'
import { useTeamStore } from '@/lib/football/store'
import type { SimplifiedPosition } from '@/lib/football/formations'
import { getFormation } from '@/lib/football/formations'

interface Props {
  reserves: SelectedPlayer[]
  startersCount: number
  onSubstitute: (reserve: SelectedPlayer) => void
  onRemove: (id: string) => void
  // Opcional: se ausente, usa o store diretamente
  onSetBenchPosition?: (reserveId: string, benchPosition: SimplifiedPosition) => void
  // Opcional: se ausente, usa o store diretamente
  onMoveToField?: (positionId: string, reserveId: string) => { ok: boolean; error?: string }
}

const POS_LABEL: Record<string, string> = {
  GK: 'Goleiro',
  DF: 'Zagueiro',
  LD: 'Lateral Direito',
  LE: 'Lateral Esquerdo',
  MF: 'Meia',
  FW: 'Atacante',
}

const POS_COLOR: Record<string, string> = {
  GK: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  DF: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  LD: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  LE: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  MF: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  FW: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
}

const BENCH_POSITION_OPTIONS: SimplifiedPosition[] = ['GK', 'DF', 'LD', 'LE', 'MF', 'FW']

export function ReserveTeam({
  reserves,
  startersCount,
  onSubstitute,
  onRemove,
  onSetBenchPosition,
  onMoveToField,
}: Props) {
  // Acessa o store apenas para os setters que podem não ter sido passados por props
  // (mantém compatibilidade, mas corrige o bug C6 onde o prop era obrigatório).
  const storeSetBenchPosition = useTeamStore((s) => s.setBenchPosition)
  const storeMoveReserveToField = useTeamStore((s) => s.moveReserveToField)
  const formationId = useTeamStore((s) => s.formationId)
  const starters = useTeamStore((s) => s.starters)

  const handleSetBenchPosition = (reserveId: string, pos: SimplifiedPosition) => {
    if (onSetBenchPosition) {
      onSetBenchPosition(reserveId, pos)
    } else {
      storeSetBenchPosition(reserveId, pos)
    }
  }

  const handleMoveToField = (positionId: string, reserveId: string, reserveName: string) => {
    const result = onMoveToField
      ? onMoveToField(positionId, reserveId)
      : storeMoveReserveToField(positionId, reserveId)
    if (result.ok) {
      toast.success(`${reserveName} movido para o campo.`, {
        description: 'A escalação foi atualizada.',
      })
    } else {
      toast.error('Não foi possível mover.', {
        description: result.error ?? 'Erro desconhecido.',
      })
    }
  }

  // Lista de posições vazias na formação atual (para o dropdown "Mover para o campo")
  const emptyPositions = (() => {
    const formation = getFormation(formationId)
    return formation.positions.filter((p) => !starters[p.id])
  })()

  return (
    <Card className="border-emerald-500/30 bg-card/95 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
          <span className="flex items-center gap-2">
            <Shirt className="h-5 w-5" />
            Banco de Reservas
          </span>
          <Badge className="bg-emerald-600 text-white">{reserves.length} no banco</Badge>
        </CardTitle>
        <CardDescription>
          Atue como técnico: convoque reservas, defina posições, mova para o campo ou faça substituições.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {reserves.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <UserCircle2 className="h-10 w-10" />
            <p className="text-sm">Nenhum reserva convocado ainda.</p>
            <p className="text-xs text-muted-foreground/70">
              Use o botão <strong>+ Reserva</strong> para convocar jogadores para o banco.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[420px] pr-2">
            <ul className="space-y-2">
              <AnimatePresence>
                {reserves.map((r) => {
                  const effectivePosition = (r.benchPosition || r.position) as SimplifiedPosition
                  const hasCustomPosition = r.benchPosition && r.benchPosition !== r.position
                  const canMoveToField = emptyPositions.length > 0

                  return (
                    <motion.li
                      key={r.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      layout
                    >
                      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md">
                        {/* Linha principal: foto + nome + ações */}
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-emerald-500/50 bg-muted">
                            <Image
                              src={r.photoUrl}
                              alt={r.name}
                              fill
                              sizes="48px"
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {r.name}
                              </span>
                              {r.shirtNumber && (
                                <span className="rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground">
                                  #{r.shirtNumber}
                                </span>
                              )}
                              <Badge
                                variant="secondary"
                                className={`px-1.5 py-0 text-[10px] ${POS_COLOR[r.position] ?? ''}`}
                              >
                                {POS_LABEL[r.position] ?? r.position}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="truncate">{r.team}</span>
                              {r.overall && (
                                <span className="font-bold text-emerald-600">{r.overall} OVR</span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 gap-1 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-700"
                              onClick={() => onSubstitute(r)}
                              disabled={startersCount === 0}
                              aria-label={`Substituir ${r.name} por um titular`}
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                              Entrar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-[11px] text-red-500 hover:bg-red-500/10 hover:text-red-600"
                              onClick={() => onRemove(r.id)}
                              aria-label={`Remover ${r.name} do banco`}
                            >
                              <Trash2 className="h-3 w-3" />
                              Remover
                            </Button>
                          </div>
                        </div>

                        {/* Seletor de posição designada no banco */}
                        <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-500/20 bg-emerald-50/50 px-2 py-1.5 dark:bg-emerald-950/20">
                          <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                            Posição no banco:
                          </span>
                          <Select
                            value={effectivePosition}
                            onValueChange={(value: string) => {
                              handleSetBenchPosition(r.id, value as SimplifiedPosition)
                            }}
                          >
                            <SelectTrigger className="h-6 flex-1 border-emerald-500/30 text-[11px] bg-transparent">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BENCH_POSITION_OPTIONS.map((pos) => (
                                <SelectItem key={pos} value={pos} className="text-[11px]">
                                  {POS_LABEL[pos]} ({pos})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {hasCustomPosition && (
                            <Badge className={`px-1 py-0 text-[9px] ${POS_COLOR[effectivePosition] ?? ''}`}>
                              Designado: {POS_LABEL[effectivePosition]}
                            </Badge>
                          )}
                        </div>

                        {/* Ação: Mover para o campo (nova funcionalidade) */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-full gap-1 border-emerald-500/40 text-[11px] text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                              disabled={!canMoveToField}
                              aria-label={`Mover ${r.name} para uma posição no campo`}
                            >
                              <MoveToField className="h-3 w-3" />
                              Mover para o campo
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-xs">
                              Posições vazias
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {emptyPositions.length === 0 ? (
                              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                Nenhuma posição vazia no campo
                              </DropdownMenuItem>
                            ) : (
                              emptyPositions.map((p) => (
                                <DropdownMenuItem
                                  key={p.id}
                                  className="text-xs"
                                  onClick={() => handleMoveToField(p.id, r.id, r.name)}
                                >
                                  <MapPin className="h-3 w-3 mr-2" />
                                  <span className="font-mono">{p.id}</span>
                                  <span className="ml-2 text-muted-foreground">
                                    ({p.role})
                                  </span>
                                </DropdownMenuItem>
                              ))
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
