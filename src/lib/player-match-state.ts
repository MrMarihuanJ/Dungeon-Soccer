// =====================================================================
// Player Match State Machine — Máquina de estados de jogador em partida
// --------------------------------------------------------------------
// Esta camada garante consistência de estado para cada jogador DENTRO
// de uma partida. Os estados possíveis são:
//
//   ACTIVE        — em campo, jogando normalmente
//   RESERVE       — no banco, disponível para entrar
//   INJURED       — lesionado, requer substituição (se houver banco)
//   SUBSTITUTED   — já foi substituído, NÃO pode voltar
//   SENT_OFF      — expulso (cartão vermelho), NÃO pode voltar
//   UNAVAILABLE   — indisponível por qualquer motivo (lesão sem sub,
//                   contusão após limite de subs, etc.)
//
// Transições permitidas (validadas no servidor):
//   ACTIVE  → RESERVE         (substituição voluntária: sai pra reserva)
//   ACTIVE  → INJURED         (lesionou)
//   ACTIVE  → SENT_OFF        (cartão vermelho)
//   ACTIVE  → SUBSTITUTED     (saiu por substituição e não volta)
//   RESERVE → ACTIVE          (entrou como substituto)
//   RESERVE → SUBSTITUTED     (entrou e depois saiu — raro mas possível)
//   INJURED → UNAVAILABLE     (sem substituição disponível ou limite esgotado)
//   INJURED → SUBSTITUTED     (substituído por lesão)
//
// Transições PROIBIDAS:
//   SENT_OFF → qualquer       (uma vez expulso, foi)
//   SUBSTITUTED → qualquer    (uma vez saiu, foi)
//   UNAVAILABLE → ACTIVE      (indisponível não volta)
//
// Esta camada NÃO persiste direto no DB — ela opera sobre o
// `TeamMatchState` (que vai dentro de homeTeamStateJson / awayTeamStateJson
// na tabela Match). A persistência é feita pelo endpoint que a invoca.
// =====================================================================

import type { TeamMatchState } from './match-engine'

export type PlayerMatchStatus =
  | 'ACTIVE'
  | 'RESERVE'
  | 'INJURED'
  | 'SUBSTITUTED'
  | 'SENT_OFF'
  | 'UNAVAILABLE'

export interface PlayerMatchState {
  playerId: string
  status: PlayerMatchStatus
  /** Quando entrou em campo (para jogadores que começaram no banco) */
  enteredAtTurn?: number
  /** Quando saiu de campo (lesão, sub, expulsão) */
  exitedAtTurn?: number
  /** Razão da saída (para auditoria em UI) */
  exitReason?: 'SUBSTITUTED' | 'INJURY' | 'SENT_OFF' | 'LIMIT_EXHAUSTED'
}

/**
 * Mapa de jogador → estado, persistido como parte do TeamMatchState.
 *
 * Estendemos o TeamMatchState original com um campo opcional `playerStates`
 * (Array<PlayerMatchState>). Quando ausente (partidas antigas), o código
 * faz fallback para os arrays legados (injuredPlayers, sentOffPlayers).
 */
export interface ExtendedTeamMatchState extends TeamMatchState {
  /** Estado granular por jogador (novo esquema) */
  playerStates?: PlayerMatchState[]
  /** IDs dos jogadores que saíram por substituição (não podem voltar) */
  substitutedOut?: string[]
  /** ID do último cobrador de falta (anti-repetição) */
  lastFreeKickTakerId?: string
}

// ---------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------

/** Limite máximo de substituições por partida (táticas + lesão). */
export const MAX_SUBSTITUTIONS = 5

// ---------------------------------------------------------------------
// Migração / normalização
// ---------------------------------------------------------------------

/**
 * Garante que um TeamMatchState tenha a estrutura estendida.
 * Se vier de uma partida legada (sem `playerStates`), inicializa vazio.
 */
export function normalizeTeamState(state: TeamMatchState | ExtendedTeamMatchState): ExtendedTeamMatchState {
  const extended = state as ExtendedTeamMatchState
  if (!extended.playerStates) extended.playerStates = []
  if (!extended.substitutedOut) extended.substitutedOut = []
  if (!extended.lastFreeKickTakerId) extended.lastFreeKickTakerId = undefined
  // Garantir que maxSubstitutions está alinhado com a constante global
  extended.maxSubstitutions = MAX_SUBSTITUTIONS
  return extended
}

// ---------------------------------------------------------------------
// Consultas (queries)
// ---------------------------------------------------------------------

export function getPlayerStatus(
  state: ExtendedTeamMatchState,
  playerId: string,
): PlayerMatchStatus {
  const ps = state.playerStates?.find((p) => p.playerId === playerId)
  if (ps) return ps.status

  // Fallback para legado
  if (state.sentOffPlayers.includes(playerId)) return 'SENT_OFF'
  if (state.injuredPlayers.includes(playerId)) return 'INJURED'
  if (state.substitutedOut?.includes(playerId)) return 'SUBSTITUTED'
  return 'ACTIVE'
}

/** Retorna IDs dos jogadores que estão ativos em campo */
export function getActivePlayerIds(state: ExtendedTeamMatchState, starterIds: string[]): string[] {
  return starterIds.filter((id) => getPlayerStatus(state, id) === 'ACTIVE')
}

/** Retorna IDs dos reservas disponíveis para entrar */
export function getAvailableReserveIds(
  state: ExtendedTeamMatchState,
  reserveIds: string[],
): string[] {
  return reserveIds.filter((id) => {
    const status = getPlayerStatus(state, id)
    return status === 'RESERVE'
  })
}

/** Substituições restantes (limite - usadas) */
export function getRemainingSubstitutions(state: ExtendedTeamMatchState): number {
  return Math.max(0, state.maxSubstitutions - state.substitutionsUsed)
}

/** Verdadeiro se o limite de substituições foi atingido */
export function isSubstitutionLimitReached(state: ExtendedTeamMatchState): boolean {
  return getRemainingSubstitutions(state) <= 0
}

// ---------------------------------------------------------------------
// Transições (commands) — cada uma valida e retorna NOVO estado
// ---------------------------------------------------------------------

/**
 * Valida e executa uma substituição.
 *
 * Regras:
 *   - outPlayerId deve estar ACTIVE
 *   - inPlayerId deve estar RESERVE
 *   - Não pode exceder o limite (5)
 *   - Não pode substituir um jogador já substituído/expulso/lesionado
 *
 * @param isForced true se for substituição por lesão (mesma contagem)
 * @throws Error com mensagem amigável se inválido
 */
export function performSubstitution(
  state: ExtendedTeamMatchState,
  outPlayerId: string,
  inPlayerId: string,
  currentTurn: number,
  isForced: boolean = false,
): ExtendedTeamMatchState {
  const newState: ExtendedTeamMatchState = normalizeTeamState({
    ...state,
    playerStates: [...(state.playerStates ?? [])],
    injuredPlayers: [...state.injuredPlayers],
    sentOffPlayers: [...state.sentOffPlayers],
    substitutedOut: [...(state.substitutedOut ?? [])],
  })

  // Validações
  const outStatus = getPlayerStatus(newState, outPlayerId)
  // Permitir substituir jogador ACTIVE ou INJURED (substituição por lesão).
  // Não permitir substituir SUBSTITUTED, SENT_OFF, UNAVAILABLE.
  if (outStatus !== 'ACTIVE' && !(outStatus === 'INJURED' && isForced)) {
    throw new Error(
      `Jogador não pode ser substituído: status atual = ${outStatus}. Apenas jogadores ativos (ou lesionados, em substituição forçada) podem sair.`,
    )
  }

  const inStatus = getPlayerStatus(newState, inPlayerId)
  if (inStatus !== 'RESERVE') {
    throw new Error(
      `Reserva não pode entrar: status atual = ${inStatus}. Apenas reservas disponíveis podem entrar.`,
    )
  }

  if (isSubstitutionLimitReached(newState)) {
    throw new Error(
      `Limite de ${MAX_SUBSTITUTIONS} substituições atingido. Não é possível fazer mais substituições.`,
    )
  }

  if (outPlayerId === inPlayerId) {
    throw new Error('Não é possível substituir um jogador por ele mesmo.')
  }

  // Aplicar transição
  newState.playerStates = newState.playerStates?.map((ps) => {
    if (ps.playerId === outPlayerId) {
      return {
        ...ps,
        status: 'SUBSTITUTED',
        exitedAtTurn: currentTurn,
        exitReason: isForced ? 'INJURY' : 'SUBSTITUTED',
      }
    }
    if (ps.playerId === inPlayerId) {
      return { ...ps, status: 'ACTIVE', enteredAtTurn: currentTurn }
    }
    return ps
  }) ?? []

  // Garantir que arrays legados estão consistentes
  if (!newState.substitutedOut) newState.substitutedOut = []
  if (!newState.substitutedOut.includes(outPlayerId)) {
    newState.substitutedOut.push(outPlayerId)
  }
  // Se foi substituição por lesão, remover de injuredPlayers (já está subbedOut)
  newState.injuredPlayers = newState.injuredPlayers.filter((id) => id !== outPlayerId)

  // Contabiliza no limite (inclui lesões — REGRA CRÍTICA do usuário)
  newState.substitutionsUsed += 1

  return newState
}

/**
 * Marca um jogador como lesionado.
 * Não realiza substituição automaticamente — o caller decide se vai substituir.
 * Se não houver substituição disponível, o jogador fica INJURED e depois UNAVAILABLE.
 */
export function markPlayerInjured(
  state: ExtendedTeamMatchState,
  playerId: string,
  currentTurn: number,
): ExtendedTeamMatchState {
  const status = getPlayerStatus(state, playerId)
  if (status !== 'ACTIVE') {
    // Não pode lesionar quem já está fora
    return state
  }

  const newState: ExtendedTeamMatchState = normalizeTeamState({
    ...state,
    playerStates: [...(state.playerStates ?? [])],
    injuredPlayers: [...state.injuredPlayers],
  })

  newState.playerStates = newState.playerStates?.map((ps) =>
    ps.playerId === playerId
      ? { ...ps, status: 'INJURED', exitedAtTurn: currentTurn, exitReason: 'INJURY' }
      : ps,
  ) ?? []

  if (!newState.injuredPlayers.includes(playerId)) {
    newState.injuredPlayers.push(playerId)
  }

  return newState
}

/**
 * Converte um jogador lesionado em indisponível (sem substituição).
 * Usado quando o limite de substituições foi atingido ou não há reservas.
 */
export function markPlayerUnavailable(
  state: ExtendedTeamMatchState,
  playerId: string,
): ExtendedTeamMatchState {
  const newState: ExtendedTeamMatchState = normalizeTeamState({
    ...state,
    playerStates: [...(state.playerStates ?? [])],
    injuredPlayers: [...state.injuredPlayers],
  })

  newState.playerStates = newState.playerStates?.map((ps) =>
    ps.playerId === playerId ? { ...ps, status: 'UNAVAILABLE' } : ps,
  ) ?? []

  // Remove de injuredPlayers (agora é UNAVAILABLE)
  newState.injuredPlayers = newState.injuredPlayers.filter((id) => id !== playerId)

  return newState
}

/**
 * Aplica cartão vermelho a um jogador.
 * - Marca como SENT_OFF (definitivamente indisponível)
 * - Adiciona a sentOffPlayers
 * - Não conta como substituição (time fica com 1 a menos)
 */
export function applyRedCard(
  state: ExtendedTeamMatchState,
  playerId: string,
  currentTurn: number,
): ExtendedTeamMatchState {
  const status = getPlayerStatus(state, playerId)
  if (status !== 'ACTIVE') {
    // Não pode expulsar quem já está fora
    return state
  }

  const newState: ExtendedTeamMatchState = normalizeTeamState({
    ...state,
    playerStates: [...(state.playerStates ?? [])],
    sentOffPlayers: [...state.sentOffPlayers],
  })

  newState.playerStates = newState.playerStates?.map((ps) =>
    ps.playerId === playerId
      ? { ...ps, status: 'SENT_OFF', exitedAtTurn: currentTurn, exitReason: 'SENT_OFF' }
      : ps,
  ) ?? []

  if (!newState.sentOffPlayers.includes(playerId)) {
    newState.sentOffPlayers.push(playerId)
  }
  newState.redCards += 1

  return newState
}

/**
 * Aplica cartão amarelo. Não muda status do jogador (continua ACTIVE),
 * apenas contabiliza para auditoria. Dois amarelos = vermelho deve ser
 * aplicado separadamente pelo caller.
 */
export function applyYellowCard(
  state: ExtendedTeamMatchState,
  playerId: string,
): ExtendedTeamMatchState {
  const newState: ExtendedTeamMatchState = normalizeTeamState({
    ...state,
  })
  newState.yellowCards += 1
  return newState
}

// ---------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------

/**
 * Cria o estado inicial de um time para uma partida.
 * Todos os titulares começam como ACTIVE, todos os reservas como RESERVE.
 */
export function createInitialTeamState(
  starterIds: string[],
  reserveIds: string[],
): ExtendedTeamMatchState {
  const playerStates: PlayerMatchState[] = [
    ...starterIds.map((id) => ({ playerId: id, status: 'ACTIVE' as const })),
    ...reserveIds.map((id) => ({ playerId: id, status: 'RESERVE' as const })),
  ]

  return normalizeTeamState({
    substitutionsUsed: 0,
    maxSubstitutions: MAX_SUBSTITUTIONS,
    redCards: 0,
    yellowCards: 0,
    injuredPlayers: [],
    sentOffPlayers: [],
    substitutedOut: [],
    playerStates,
    lastFreeKickTakerId: undefined,
  })
}

/**
 * Inicializa estado legado (sem starterIds/reserveIds).
 * Mantém compatibilidade com partidas antigas.
 */
export function createInitialTeamStateLegacy(): ExtendedTeamMatchState {
  return normalizeTeamState({
    substitutionsUsed: 0,
    maxSubstitutions: MAX_SUBSTITUTIONS,
    redCards: 0,
    yellowCards: 0,
    injuredPlayers: [],
    sentOffPlayers: [],
    substitutedOut: [],
    playerStates: [],
  })
}

// ---------------------------------------------------------------------
// Snapshot para UI
// ---------------------------------------------------------------------

export interface PlayerStatusSnapshot {
  playerId: string
  status: PlayerMatchStatus
  isOnField: boolean
  isAvailableForAction: boolean
  canBeSubstitutedOut: boolean
  canBeSubstitutedIn: boolean
  exitReason?: string
}

export function getStatusSnapshot(
  state: ExtendedTeamMatchState,
  playerId: string,
): PlayerStatusSnapshot {
  const status = getPlayerStatus(state, playerId)
  return {
    playerId,
    status,
    isOnField: status === 'ACTIVE',
    isAvailableForAction: status === 'ACTIVE',
    canBeSubstitutedOut: status === 'ACTIVE',
    canBeSubstitutedIn: status === 'RESERVE',
    exitReason: state.playerStates?.find((p) => p.playerId === playerId)?.exitReason,
  }
}

/**
 * Metadados visuais para cada status (cor, ícone, rótulo).
 * Usado pela UI para renderizar badges consistentes.
 */
export const STATUS_META: Record<PlayerMatchStatus, {
  label: string
  emoji: string
  color: string // tailwind classes
  description: string
}> = {
  ACTIVE: {
    label: 'Ativo',
    emoji: '⚽',
    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    description: 'Jogador em campo, disponível para ações.',
  },
  RESERVE: {
    label: 'Reserva',
    emoji: '🪑',
    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    description: 'No banco, disponível para entrar como substituto.',
  },
  INJURED: {
    label: 'Lesionado',
    emoji: '🩹',
    color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    description: 'Lesionado — requer substituição ou será indisponibilizado.',
  },
  SUBSTITUTED: {
    label: 'Substituído',
    emoji: '↔️',
    color: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    description: 'Já saiu por substituição. Não pode voltar.',
  },
  SENT_OFF: {
    label: 'Expulso',
    emoji: '🟥',
    color: 'bg-red-500/15 text-red-300 border-red-500/30',
    description: 'Cartão vermelho. Definitivamente indisponível.',
  },
  UNAVAILABLE: {
    label: 'Indisponível',
    emoji: '🚫',
    color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    description: 'Indisponível (lesão sem substituição ou limite esgotado).',
  },
}
