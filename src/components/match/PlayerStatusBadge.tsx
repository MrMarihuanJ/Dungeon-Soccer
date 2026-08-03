'use client'

// =====================================================================
// PlayerStatusBadge - Badge visual para o status de um jogador em partida
// --------------------------------------------------------------------
// Renderiza um badge colorido com emoji + label baseado no status:
//   ACTIVE      — Ativo (em campo)
//   RESERVE     — Reserva (no banco)
//   INJURED     — Lesionado
//   SUBSTITUTED — Substituído
//   SENT_OFF    — Expulso
//   UNAVAILABLE — Indisponível
//
// Usa a tabela STATUS_META de player-match-state.ts para consistência.
// =====================================================================

import { Badge } from '@/components/ui/badge'
import { STATUS_META, type PlayerMatchStatus } from '@/lib/player-match-state'

interface Props {
  status: PlayerMatchStatus
  /** Tamanho: sm = compacto (apenas emoji + label), default = com description */
  size?: 'sm' | 'default'
  /** Mostra tooltip com descrição completa */
  showTooltip?: boolean
  className?: string
}

export function PlayerStatusBadge({
  status,
  size = 'default',
  showTooltip = true,
  className = '',
}: Props) {
  const meta = STATUS_META[status]
  if (!meta) return null

  if (size === 'sm') {
    return (
      <Badge
        variant="outline"
        className={`${meta.color} ${className}`}
        title={showTooltip ? `${meta.label}: ${meta.description}` : undefined}
      >
        <span className="mr-1">{meta.emoji}</span>
        {meta.label}
      </Badge>
    )
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${meta.color} ${className}`}
      title={showTooltip ? meta.description : undefined}
    >
      <span className="text-sm">{meta.emoji}</span>
      <div className="flex flex-col">
        <span className="text-[11px] font-semibold leading-tight">{meta.label}</span>
        {showTooltip && (
          <span className="text-[9px] opacity-80 leading-tight">{meta.description}</span>
        )}
      </div>
    </div>
  )
}
