// =====================================================================
// Store Zustand - Estado do time do Cartoleiro FC
// ---------------------------------------------------------------------
// Mantém estado de titulares, reservas, formação selecionada e操作
// de substituição. Persiste em localStorage para não perder o time
// ao recarregar a página.
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
}

// Map: positionId -> SelectedPlayer | null
export type StartersMap = Record<string, SelectedPlayer | null>

interface TeamState {
  formationId: string
  starters: StartersMap
  reserves: SelectedPlayer[] // lista simples de reservas
  gameMode: 'DREAM_TEAM' | 'WORLD_CUP'

  setFormation: (id: string) => void
  setStarter: (positionId: string, player: SelectedPlayer) => void
  removeStarter: (positionId: string) => void
  addReserve: (player: SelectedPlayer) => void
  removeReserve: (id: string) => void
  // Substitui titular por reserva: reserva entra na posição e titular vai ao banco
  substitute: (positionId: string, reserveId: string) => void
  clearTeam: () => void
  // Inicializa starters com base na formação atual (chaves nulas)
  initStarters: () => void
  // Carrega time a partir de objeto (do servidor ou easter egg)
  loadFromObject: (team: { formation: string; starters: any; reserves: any }) => void
  // Define o modo de jogo (Dream Team / World Cup)
  setGameMode: (mode: 'DREAM_TEAM' | 'WORLD_CUP') => void
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
    }),
    {
      name: 'cartoleiro-fc-team',
      version: 1,
    },
  ),
)
