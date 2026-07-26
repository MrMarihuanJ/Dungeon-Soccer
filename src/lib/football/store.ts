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
  // ===== CORREÇÃO 1: posição designada do reserva no banco =====
  // Permite que o usuário mude a "posição de banco" de um reserva
  // sem precisar removê-lo e readicioná-lo. Antes este campo não
  // existia na store e o callback `onSetBenchPosition` era ignorado
  // (bug reportado: "as opções aparecem, mas nada acontece").
  benchPosition?: string  // GK | DF | LD | LE | MF | FW (override opcional)
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
  // Substitui titular por reserva: reserva entra na posição e titular vai ao banco
  substitute: (positionId: string, reserveId: string) => void
  // ===== CORREÇÃO 1: define/muda a posição designada de um reserva no banco =====
  setBenchPosition: (reserveId: string, benchPosition: string) => void
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
          // ===== CORREÇÃO 1: ao entrar em campo, o reserva perde benchPosition =====
          // (benchPosition só faz sentido para jogadores no banco)
          const enteringField: SelectedPlayer = { ...reserve, benchPosition: undefined }
          const newStarters = { ...state.starters, [positionId]: enteringField }
          let newReserves = state.reserves.filter((r) => r.id !== reserveId)
          if (current) {
            // Quem sai vai para o banco sem benchPosition (vai herdar a default)
            newReserves = [...newReserves, { ...current, benchPosition: undefined }]
          }
          return { starters: newStarters, reserves: newReserves }
        }),

      // ===== CORREÇÃO 1: implementação de setBenchPosition =====
      // Atualiza o campo `benchPosition` do reserva sem tocar em `position`.
      // Permite que o ReserveTeam reaja imediatamente ao clique no <Select>.
      setBenchPosition: (reserveId, benchPosition) =>
        set((state) => ({
          reserves: state.reserves.map((r) =>
            r.id === reserveId ? { ...r, benchPosition } : r
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
      // ===== CORREÇÃO 1: bump version para 2 (adicionado campo benchPosition) =====
      // Migration: garante que objetos antigos sem `benchPosition` continuem funcionando
      version: 2,
      // FIX: skip hydration during SSR to prevent mismatch.
      // Call hydrateTeamStore() on client mount instead.
      skipHydration: true,
      migrate: (persistedState: any, _version: number) => {
        // Garante que reservas antigos tenham o campo benchPosition (undefined)
        if (persistedState && Array.isArray(persistedState.reserves)) {
          persistedState.reserves = persistedState.reserves.map((r: any) =>
            r && r.benchPosition === undefined
              ? { ...r, benchPosition: undefined }
              : r
          )
        }
        return persistedState
      },
    },
  ),
)

// ===== Hydration helper — call on client mount =====
export async function hydrateTeamStore(): Promise<void> {
  if (useTeamStore.getState()._hasHydrated) return
  await useTeamStore.persist.rehydrate()
  useTeamStore.setState({ _hasHydrated: true })
}
