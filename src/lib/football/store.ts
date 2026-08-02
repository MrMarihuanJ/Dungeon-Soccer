// =====================================================================
// Store Zustand - Estado do time do Cartoleiro FC
// ---------------------------------------------------------------------
// Mantém estado de titulares, reservas, formação selecionada e操作
// de substituição. Persiste em localStorage para não perder o time
// ao recarregar a página.
//
// FIX: skipHydration=true prevents SSR/client mismatch.
// Call hydrateTeamStore() on client mount to load localStorage data.
// =====================================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getFormation, type FieldPosition } from './formations'

export interface SelectedPlayer {
  id: string          // ID no banco
  name: string        // Nome curto
  fullName: string    // Nome completo
  team: string        // Time atual
  position: string    // GK | DF | LD | LE | MF | FW
  photoUrl: string    // URL da foto
  nationality?: string | null
  shirtNumber?: number | null
  // Sistema de rating estilo FIFA
  overall?: number
  age?: number
  pace?: number
  shooting?: number
  passing?: number
  dribbling?: number
  defending?: number
  physical?: number
  leagueTier?: string
  isRetired?: boolean
  isInactive?: boolean
  source?: string
  // ===== Posição designada no banco (opcional) =====
  // Quando o usuário escolhe uma posição diferente da posição natural
  // do jogador para a reserva no banco (ex.: um ZAG jogando como LD).
  // Se ausente, a posição efetiva é `position`.
  benchPosition?: string
}

/**
 * Retorna a posição efetiva de uma reserva (benchPosition se definida,
 * senão a posição natural).
 */
export function getEffectivePosition(player: SelectedPlayer): string {
  return player.benchPosition ?? player.position
}

// Map: positionId -> SelectedPlayer | null
export type StartersMap = Record<string, SelectedPlayer | null>

interface TeamState {
  formationId: string
  starters: StartersMap
  reserves: SelectedPlayer[] // lista simples de reservas
  gameMode: 'DREAM_TEAM' | 'WORLD_CUP'
  _hasHydrated: boolean  // internal flag — true after localStorage data loaded

  setFormation: (id: string) => void
  setStarter: (positionId: string, player: SelectedPlayer) => void
  removeStarter: (positionId: string) => void
  addReserve: (player: SelectedPlayer) => void
  removeReserve: (id: string) => void
  /**
   * Substitui titular por reserva: reserva entra na posição e titular vai ao banco.
   * Também usada pela UI de mover-do-banco-para-o-campo.
   */
  substitute: (positionId: string, reserveId: string) => void
  /**
   * Move uma reserva diretamente para uma posição livre no campo (sem tirar ninguém).
   * Valida que a posição está vazia e que a posição natural (ou benchPosition)
   * do jogador é compatível com a posição-alvo.
   */
  moveReserveToField: (positionId: string, reserveId: string) => { ok: boolean; error?: string }
  /**
   * Define a posição designada no banco para uma reserva.
   */
  setBenchPosition: (reserveId: string, position: string) => void
  clearTeam: () => void
  // Inicializa starters com base na formação atual (chaves nulas)
  initStarters: () => void
  // Carrega time a partir de objeto (do servidor ou easter egg)
  loadFromObject: (team: { formation: string; starters: any; reserves: any }) => void
  // Define o modo de jogo (Dream Team / World Cup)
  setGameMode: (mode: 'DREAM_TEAM' | 'WORLD_CUP') => void
  setHasHydrated: (value: boolean) => void
}

const buildEmptyStarters = (formationId: string): StartersMap => {
  const formation = getFormation(formationId)
  const map: StartersMap = {}
  formation.positions.forEach((p: FieldPosition) => {
    map[p.id] = null
  })
  return map
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      formationId: '4-3-3',
      starters: buildEmptyStarters('4-3-3'),
      reserves: [],
      gameMode: 'DREAM_TEAM',
      _hasHydrated: false,

      setFormation: (id) =>
        set((state) => {
          const newStarters = buildEmptyStarters(id)
          // Tenta preservar titulares já escolhidos se a posição existir na nova formação
          // Caso contrário, move o jogador para o banco de reservas
          const orphaned: SelectedPlayer[] = []
          Object.entries(state.starters).forEach(([posId, player]) => {
            if (!player) return
            if (newStarters[posId] !== undefined) {
              newStarters[posId] = player
            } else {
              orphaned.push(player)
            }
          })
          // Adiciona orfãos ao banco (sem duplicar)
          const existingIds = new Set(state.reserves.map((r) => r.id))
          const newReserves = [
            ...state.reserves,
            ...orphaned.filter((p) => !existingIds.has(p.id)),
          ]
          return { formationId: id, starters: newStarters, reserves: newReserves }
        }),

      setStarter: (positionId, player) =>
        set((state) => {
          const updated: StartersMap = { ...state.starters, [positionId]: player }
          // Remove o jogador dos reservas se ele estava lá
          const newReserves = state.reserves.filter((r) => r.id !== player.id)
          return { starters: updated, reserves: newReserves }
        }),

      removeStarter: (positionId) =>
        set((state) => ({
          starters: { ...state.starters, [positionId]: null },
        })),

      addReserve: (player) =>
        set((state) => {
          // Não adiciona duplicado
          if (state.reserves.some((r) => r.id === player.id)) return state
          // Remove dos titulares se estiver lá
          const newStarters: StartersMap = {}
          Object.entries(state.starters).forEach(([k, v]) => {
            newStarters[k] = v && v.id === player.id ? null : v
          })
          return { reserves: [...state.reserves, player], starters: newStarters }
        }),

      removeReserve: (id) =>
        set((state) => ({
          reserves: state.reserves.filter((r) => r.id !== id),
        })),

      substitute: (positionId, reserveId) =>
        set((state) => {
          const current = state.starters[positionId]
          const reserve = state.reserves.find((r) => r.id === reserveId)
          if (!reserve) return state
          const newStarters = { ...state.starters, [positionId]: reserve }
          let newReserves = state.reserves.filter((r) => r.id !== reserveId)
          if (current) {
            newReserves = [...newReserves, current]
          }
          return { starters: newStarters, reserves: newReserves }
        }),

      // ===== NOVO: Mover reserva diretamente para posição livre no campo =====
      // Permite que uma reserva ocupe uma posição vazia sem precisar tirar
      // um titular. Valida compatibilidade de posição para evitar escalações
      // impossíveis (ex.: um GK como atacante).
      moveReserveToField: (positionId, reserveId) => {
        const state = get()
        const reserve = state.reserves.find((r) => r.id === reserveId)
        if (!reserve) {
          return { ok: false, error: 'Reserva não encontrado.' }
        }
        const formation = getFormation(state.formationId)
        const targetPos = formation.positions.find((p) => p.id === positionId)
        if (!targetPos) {
          return { ok: false, error: 'Posição de destino inválida.' }
        }
        if (state.starters[positionId]) {
          return { ok: false, error: 'Posição já ocupada. Use substituir para trocar.' }
        }
        // Validação de compatibilidade de posição
        const playerEffectivePos = reserve.benchPosition ?? reserve.position
        const POS_GROUPS: Record<string, string[]> = {
          GK: ['GK'],
          DF: ['DF', 'LD', 'LE', 'CB', 'LB', 'RB'],
          MF: ['MF', 'CM', 'DM', 'AM', 'RM', 'LM'],
          FW: ['FW', 'ST', 'CF', 'RW', 'LW'],
        }
        const playerGroup = Object.entries(POS_GROUPS).find(([, list]) =>
          list.includes(playerEffectivePos),
        )?.[0]
        const targetGroup = Object.entries(POS_GROUPS).find(([, list]) =>
          list.includes(targetPos.role),
        )?.[0]
        // PermiteMesmo grupo OU adjacente (DF↔MF, MF↔FW). Proibe GK↔outra coisa.
        if (playerGroup !== targetGroup) {
          if (playerGroup === 'GK' || targetGroup === 'GK') {
            return { ok: false, error: `Goleiro não pode jogar em ${targetPos.role}.` }
          }
          const adjacent: Record<string, string[]> = {
            DF: ['MF'],
            MF: ['DF', 'FW'],
            FW: ['MF'],
          }
          if (!adjacent[playerGroup ?? '']?.includes(targetGroup ?? '')) {
            return {
              ok: false,
              error: `${reserve.name} (${playerEffectivePos}) não pode jogar em ${targetPos.role}.`,
            }
          }
        }
        // Aplica a movimentação
        set((s) => ({
          starters: { ...s.starters, [positionId]: reserve },
          reserves: s.reserves.filter((r) => r.id !== reserveId),
        }))
        return { ok: true }
      },

      setBenchPosition: (reserveId, position) =>
        set((state) => ({
          reserves: state.reserves.map((r) =>
            r.id === reserveId ? { ...r, benchPosition: position } : r,
          ),
        })),

      clearTeam: () =>
        set(() => ({
          starters: buildEmptyStarters(get().formationId),
          reserves: [],
        })),

      initStarters: () =>
        set((state) => {
          // Garante que todas as posições da formação atual existam no mapa
          const formation = getFormation(state.formationId)
          const map: StartersMap = { ...state.starters }
          formation.positions.forEach((p) => {
            if (map[p.id] === undefined) map[p.id] = null
          })
          return { starters: map }
        }),

      loadFromObject: (team) =>
        set(() => {
          const formation = getFormation(team.formation)
          const map: StartersMap = {}
          formation.positions.forEach((p) => {
            map[p.id] = null
          })
          // Copia starters do objeto, se a posição existir na formação
          if (team.starters && typeof team.starters === 'object') {
            Object.entries(team.starters).forEach(([posId, player]) => {
              if (map[posId] !== undefined && player) {
                map[posId] = player as SelectedPlayer
              }
            })
          }
          const reservesList: SelectedPlayer[] = Array.isArray(team.reserves) ? team.reserves : []
          return { formationId: team.formation, starters: map, reserves: reservesList }
        }),

      setGameMode: (mode) =>
        set((state) => {
          // Ao trocar para World Cup, remove jogadores aposentados/inativos do time
          if (mode === 'WORLD_CUP') {
            const newStarters: StartersMap = {}
            const removed: SelectedPlayer[] = []
            Object.entries(state.starters).forEach(([posId, player]) => {
              if (player && (player.isRetired || player.isInactive)) {
                newStarters[posId] = null
                removed.push(player)
              } else {
                newStarters[posId] = player
              }
            })
            // Reservas aposentados também são removidos
            const newReserves = state.reserves.filter((r) => !r.isRetired && !r.isInactive)
            return { gameMode: mode, starters: newStarters, reserves: newReserves }
          }
          // Dream Team permite todos
          return { gameMode: mode }
        }),

      setHasHydrated: (value) => set({ _hasHydrated: value }),
    }),
    {
      name: 'cartoleiro-fc-team',
      version: 1,
      // FIX: skip hydration during SSR to prevent mismatch.
      // Call hydrateTeamStore() on client mount instead.
      skipHydration: true,
    },
  ),
)

// ===== Hydration helper — call on client mount =====
export async function hydrateTeamStore(): Promise<void> {
  if (useTeamStore.getState()._hasHydrated) return
  await useTeamStore.persist.rehydrate()
  useTeamStore.setState({ _hasHydrated: true })
}
