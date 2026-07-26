'use client'

// =====================================================================
// SubstitutionDialog - Diálogo de substituição
// --------------------------------------------------------------------
// Quando o usuário clica em "Entrar" num reserva, este diálogo abre
// para ele escolher qual titular vai sair.
// Mostra apenas titulares cuja posição seja compatível com a do
// reserva (considerando benchPosition se definida), mas também
// permite troca forçada (qualquer posição) com aviso.
//
// NOVO: Se o reserva tem benchPosition definido, a compatibilidade
// é calculada com base na posição designada, não na posição natural.
// =====================================================================

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ArrowRight, AlertTriangle, MapPin } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import type { SelectedPlayer } from '@/lib/football/store'
import { ROLE_TO_POSITION, POSITION_GROUPS, type SimplifiedPosition, type Formation } from '@/lib/football/formations'

const POS_LABEL: Record<string, string> = {
  GK: 'Goleiro',
  DF: 'Zagueiro',
  LD: 'Lateral Direito',
  LE: 'Lateral Esquerdo',
  MF: 'Meia',
  FW: 'Atacante',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reserve: SelectedPlayer | null
  formation: Formation
  starters: Record<string, SelectedPlayer | null>
  onConfirm: (positionId: string) => void
}

export function SubstitutionDialog({
  open,
  onOpenChange,
  reserve,
  formation,
  starters,
  onConfirm,
}: Props) {
  const [allowAnyPosition, setAllowAnyPosition] = useState(false)

  if (!reserve) return null

  // Usa benchPosition se definido, senão posição natural
  const effectivePosition = (reserve.benchPosition || reserve.position) as SimplifiedPosition
  const hasCustomPosition = reserve.benchPosition && reserve.benchPosition !== reserve.position

  // Lista titulares ocupados (com jogador)
  const filledStarters = formation.positions
    .map((p) => ({ position: p, player: starters[p.id] }))
    .filter((x) => x.player !== null) as { position: typeof formation.positions[number]; player: SelectedPlayer }[]

  // Filtra por posição compatível (mesmo grupo defensivo: DF/LD/LE são compatíveis)
  const reserveGroup = POSITION_GROUPS[effectivePosition] ?? 'DEF'
  const compatible = filledStarters.filter((x) => {
    const starterGroup = POSITION_GROUPS[x.player.position as SimplifiedPosition] ?? 'DEF'
    return reserveGroup === starterGroup
  })
  const list = allowAnyPosition ? filledStarters : compatible

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <ArrowRight className="h-5 w-5" /> Substituição
          </DialogTitle>
          <DialogDescription>
            Escolha qual titular será substituído por{' '}
            <strong className="text-emerald-700">{reserve.name}</strong> ({reserve.team}).
          </DialogDescription>
        </DialogHeader>

        {/* Card do reserva que vai entrar */}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-emerald-500 bg-white">
            <Image src={reserve.photoUrl} alt={reserve.name} fill sizes="48px" className="object-cover" unoptimized />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900">{reserve.name}</div>
            <div className="text-xs text-gray-600">{reserve.team} · Posição natural: {reserve.position}</div>
            {hasCustomPosition && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 text-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-700">
                  Designado como: {POS_LABEL[effectivePosition]} ({effectivePosition})
                </span>
              </div>
            )}
          </div>
          <Badge className="bg-emerald-600 text-white">Reserva</Badge>
        </div>

        {/* Toggle: permitir troca por qualquer posição */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-col">
            <Label htmlFor="any-pos" className="text-sm font-medium">
              Permitir troca em qualquer posição
            </Label>
            <span className="text-[11px] text-gray-500">
              Por padrão, só mostramos titulares compatíveis com {POS_LABEL[effectivePosition]}.
            </span>
          </div>
          <Switch id="any-pos" checked={allowAnyPosition} onCheckedChange={setAllowAnyPosition} />
        </div>

        {allowAnyPosition && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Atenção: trocar jogadores de posições diferentes pode deixar seu time desequilibrado.</span>
          </div>
        )}

        {/* Lista de titulares */}
        <ScrollArea className="h-[260px] rounded-lg border">
          <ul className="divide-y divide-gray-100">
            {list.length === 0 && (
              <li className="p-6 text-center text-sm text-gray-400">
                Nenhum titular elegível para {POS_LABEL[effectivePosition]}. Ative a opção acima para ver todos.
              </li>
            )}
            {list.map(({ position, player }) => (
              <li key={position.id}>
                <button
                  type="button"
                  onClick={() => {
                    onConfirm(position.id)
                    onOpenChange(false)
                  }}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-emerald-50"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
                    <Image src={player!.photoUrl} alt={player!.name} fill sizes="40px" className="object-cover" unoptimized />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-gray-900">{player!.name}</span>
                      <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-600">
                        {position.label}
                      </span>
                    </div>
                    <div className="truncate text-xs text-gray-500">{player!.team} · {player!.position}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-emerald-600" />
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
