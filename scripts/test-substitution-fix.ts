// Quick sanity test for the substitution hydration fix.
// Verifies that hydrating an empty team state from a UserTeam-like data
// structure correctly marks reserves as RESERVE (not ACTIVE), allowing
// performSubstitution to succeed.
//
// Run: bun run scripts/test-substitution-fix.ts

import {
  createInitialTeamState,
  performSubstitution,
  getPlayerStatus,
  normalizeTeamState,
  type ExtendedTeamMatchState,
  type PlayerMatchState,
} from '../src/lib/player-match-state'
import type { TeamMatchState } from '../src/lib/match-engine'

// Simulate what the substitution route does when teamState is '{}'
const emptyTeamState: TeamMatchState = {
  substitutionsUsed: 0,
  maxSubstitutions: 5,
  redCards: 0,
  yellowCards: 0,
  injuredPlayers: [],
  sentOffPlayers: [],
}

// Simulate UserTeam from DB (starters as map, reserves as array)
const fakeUserTeam = {
  starters: JSON.stringify({
    pos1: { id: 'starter1', name: 'Starter 1' },
    pos2: { id: 'starter2', name: 'Starter 2' },
    pos3: { id: 'starter3', name: 'Starter 3' },
  }),
  reserves: JSON.stringify([
    { id: 'reserve1', name: 'Reserve 1' },
    { id: 'reserve2', name: 'Reserve 2' },
  ]),
}

// Replicate the hydration logic from the route
function hydrate(
  state: ExtendedTeamMatchState,
  userTeam: { starters: string; reserves: string },
): ExtendedTeamMatchState {
  const hydrated = normalizeTeamState({
    ...state,
    playerStates: [...(state.playerStates ?? [])],
  })

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
}

console.log('=== Test 1: Empty state without hydration (the bug) ===')
{
  const state = normalizeTeamState(emptyTeamState)
  const outStatus = getPlayerStatus(state, 'starter1')
  const inStatus = getPlayerStatus(state, 'reserve1')
  console.log(`  starter1 status: ${outStatus} (expected ACTIVE)`)
  console.log(`  reserve1 status: ${inStatus} (BUG: shows ACTIVE, should be RESERVE)`)
  try {
    performSubstitution(state, 'starter1', 'reserve1', 1, false)
    console.log('  ✅ Substitution succeeded (unexpected)')
  } catch (err: any) {
    console.log(`  ❌ Substitution failed (the bug): ${err.message}`)
  }
}

console.log('')
console.log('=== Test 2: Empty state WITH hydration (the fix) ===')
{
  const state = hydrate(emptyTeamState, fakeUserTeam)
  const outStatus = getPlayerStatus(state, 'starter1')
  const inStatus = getPlayerStatus(state, 'reserve1')
  console.log(`  starter1 status: ${outStatus} (expected ACTIVE)`)
  console.log(`  reserve1 status: ${inStatus} (expected RESERVE)`)
  try {
    const newState = performSubstitution(state, 'starter1', 'reserve1', 1, false)
    console.log(`  ✅ Substitution succeeded!`)
    console.log(`  New substitutionsUsed: ${newState.substitutionsUsed} (expected 1)`)
    console.log(`  starter1 now: ${getPlayerStatus(newState, 'starter1')} (expected SUBSTITUTED)`)
    console.log(`  reserve1 now: ${getPlayerStatus(newState, 'reserve1')} (expected ACTIVE)`)
  } catch (err: any) {
    console.log(`  ❌ Substitution failed: ${err.message}`)
  }
}

console.log('')
console.log("=== Test 3: Idempotent hydration (second call does not break) ===")
{
  const state1 = hydrate(emptyTeamState, fakeUserTeam)
  const state2 = hydrate(state1, fakeUserTeam)
  console.log(`  playerStates count after 1st hydrate: ${state1.playerStates?.length}`)
  console.log(`  playerStates count after 2nd hydrate: ${state2.playerStates?.length}`)
  if (state1.playerStates?.length === state2.playerStates?.length) {
    console.log('  ✅ Idempotent — no duplicates added')
  } else {
    console.log('  ❌ Hydration is not idempotent!')
  }
}

console.log('')
console.log('=== Test 4: Hydration preserves existing SENT_OFF status ===')
{
  // Pre-existing state: starter2 was already sent off
  const preExisting: ExtendedTeamMatchState = {
    ...emptyTeamState,
    playerStates: [{ playerId: 'starter2', status: 'SENT_OFF', exitReason: 'SENT_OFF' }],
    sentOffPlayers: ['starter2'],
  }
  const state = hydrate(preExisting, fakeUserTeam)
  const starter2Status = getPlayerStatus(state, 'starter2')
  console.log(`  starter2 status: ${starter2Status} (expected SENT_OFF — preserved)`)
  if (starter2Status === 'SENT_OFF') {
    console.log('  ✅ Pre-existing statuses preserved')
  } else {
    console.log('  ❌ Pre-existing status was overwritten!')
  }
}
