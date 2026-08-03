// =====================================================================
// Team State Hydration — shared helper for legacy match recovery
// --------------------------------------------------------------------
// Used by /api/match/action and /api/match/free-kick-resolve to ensure
// that matches created BEFORE the v3.2 hydration fix (which initializes
// teamStateJson at match creation) still have correct playerStates.
//
// For each team, if playerStates is empty AND a primary UserTeam exists
// for the user, we hydrate it inline (starters → ACTIVE, reserves →
// RESERVE). Existing entries are preserved.
// =====================================================================

import { db } from '@/lib/db'
import {
  normalizeTeamState,
  createInitialTeamState,
  type ExtendedTeamMatchState,
  type PlayerMatchState,
} from '@/lib/player-match-state'
import type { TeamMatchState } from '@/lib/match-engine'

/**
 * Hydrates a team state from the user's primary UserTeam.
 * Idempotent: only adds missing players; never overrides existing entries.
 */
export async function hydrateTeamStateFromUserId(
  userId: string | null | undefined,
  state: ExtendedTeamMatchState | TeamMatchState,
): Promise<ExtendedTeamMatchState> {
  const hydrated = normalizeTeamState(state)

  if (!userId) return hydrated

  try {
    const userTeam = await db.userTeam.findFirst({
      where: { userId, isPrimary: true },
    })
    if (!userTeam) return hydrated

    const startersMap = JSON.parse(userTeam.starters || '{}') as Record<string, { id?: string } | null>
    const reservesList = JSON.parse(userTeam.reserves || '[]') as Array<{ id?: string }>

    const starterIds = Object.values(startersMap)
      .filter((p): p is { id: string } => Boolean(p && p.id))
      .map((p) => p.id)
    const reserveIds = reservesList
      .filter((p): p is { id: string } => Boolean(p && p.id))
      .map((p) => p.id)

    const existingIds = new Set((hydrated.playerStates ?? []).map((p) => p.playerId))
    const newEntries: PlayerMatchState[] = []

    for (const id of starterIds) {
      if (!existingIds.has(id)) {
        newEntries.push({ playerId: id, status: 'ACTIVE' })
        existingIds.add(id)
      }
    }
    for (const id of reserveIds) {
      if (!existingIds.has(id)) {
        newEntries.push({ playerId: id, status: 'RESERVE' })
        existingIds.add(id)
      }
    }

    if (newEntries.length > 0) {
      hydrated.playerStates = [...(hydrated.playerStates ?? []), ...newEntries]
    }
    return hydrated
  } catch (err) {
    console.error('[hydrateTeamStateFromUserId] failed:', err)
    return hydrated
  }
}

/**
 * Builds a fresh initial team state for a user — used when no prior state
 * exists at all. Equivalent to what /api/match/create does now.
 */
export async function buildFreshTeamState(userId: string | null | undefined): Promise<ExtendedTeamMatchState> {
  if (!userId) return createInitialTeamState([], [])
  const hydrated = await hydrateTeamStateFromUserId(userId, createInitialTeamState([], []))
  return hydrated
}
