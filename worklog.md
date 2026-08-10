---
Task ID: v3.2-main
Agent: Super Z (main)
Task: Fix free kick freeze, substitution bug, enhance XP system with match stats, add cards/injuries/availability UI, implement idempotent XP system with progression and rewards.

Work Log:
- Investigated existing code: free-kick-system.ts, player-match-state.ts, xp-system.ts, match-engine.ts, action/substitution/free-kick-resolve routes, MatchArena.tsx, FreeKickDialog.tsx, grant-xp-helper.ts, dnd-actions.ts, prisma/schema.prisma
- Identified root cause of free kick freeze: `pendingFreeKickInfo` state was declared in MatchArena but NEVER populated from action response data. The FreeKickDialog opened with null prop, returned null (invisible), and `processing=true` was never reset — game frozen.
- Identified root cause of substitution bug: `homeTeamStateJson` and `awayTeamStateJson` were initialized to `'{}'` at match creation, so `playerStates` was empty. `getPlayerStatus()` fell back to 'ACTIVE' for everyone (including reserves, which should be 'RESERVE').
- Verified free kick actions are already exclusive to FREE_KICK context (sampleMixedActions filters out FREE_KICK category) — no fix needed.

Fixes applied:
- MatchArena.tsx: Set `pendingFreeKickInfo` from `data.pendingFreeKick` in action response (fixes freeze)
- MatchArena.tsx: Reset `processing=false` when opening FreeKickDialog and SubstitutionModal (so user can interact)
- MatchArena.tsx: Clear `pendingFreeKickInfo` after free kick resolution
- MatchArena.tsx: Sync `pendingFreeKickInfo` from server state in `fetchMatchState` (for opponent polling)
- /api/match/create: Added `buildInitialTeamStateJson()` that hydrates `homeTeamStateJson` with proper playerStates (starters as ACTIVE, reserves as RESERVE) at match creation
- /api/match/join: Added same hydration for `awayTeamStateJson` when opponent joins
- /api/match/action: Added hydration fallback for legacy matches (created before v3.2)
- /api/match/free-kick-resolve: Same hydration fallback
- /api/match/substitution: Refactored to use shared `hydrateTeamStateFromUserId` helper
- New file: src/lib/team-state-hydration.ts (shared hydration helper)

XP System Enhancements:
- xp-system.ts: Added `computeTeamMatchStats()` function that extracts goals, cards, fouls, offsides, ball steals, goalkeeper saves from match events
- xp-system.ts: Extended `calculateMatchXp()` to accept `stats` field and apply bonuses/penalties:
  * +3 per goal (cap +15)
  * +2 per ball steal (cap +10)
  * +3 per goalkeeper save (cap +12)
  * +1 per foul suffered (cap +5)
  * -1 per yellow card (cap -6)
  * -3 per red card (cap -9)
  * -1 per offside (cap -3)
  * Floor at 0 (never negative)
- grant-xp-helper.ts: Now fetches match events and computes stats for both teams, passes to calculateMatchXp

New API Endpoints:
- GET /api/user/profile: Returns XP, level, progress, rewards, W/L/D stats, win rate
- GET /api/user/xp-history: Returns paginated XP grant history with summary

New UI Components:
- src/components/user/XpPanel.tsx: Full XP/level panel with progress bar, rewards, stats
- src/components/match/PlayerStatusBadge.tsx: Visual badge for player status (ACTIVE/RESERVE/INJURED/etc.)
- src/components/match/EventHistoryPanel.tsx: Rich event history with badges, colors, highlights

UI Integration:
- MatchArena.tsx: Added XpPanel to FINISHED phase (shows progress after match)
- MatchArena.tsx: Added xpGrantedInfo state with toast showing XP gained + level-up
- MatchArena.tsx: Replaced simple history list with EventHistoryPanel (richer UI with goal/crit/fail badges)
- TeamBuilderApp.tsx: Added XpPanel to sidebar (visible when user is logged in)

Tests:
- Added 10 new tests for computeTeamMatchStats and calculateMatchXp with stats
- All 154 tests pass (was 144 before)
- Lint: 0 errors, 2 pre-existing warnings

Verification:
- Dev server runs on port 3000 (HTTP 200)
- /api/user/profile returns full profile JSON correctly
- /api/user/xp-history returns history correctly
- Agent Browser confirmed XpPanel renders with all elements (level, XP, progress, rewards, stats)
- Page loads cleanly with no console errors

Stage Summary:
- CRITICAL: Free kick freeze FIXED (root cause: missing state propagation from action response to dialog)
- CRITICAL: Substitution bug FIXED (root cause: empty playerStates at match creation, fixed by hydrating at create/join time)
- XP system now incorporates match statistics (goals, cards, fouls, steals, saves, offsides)
- Idempotent XP granting preserved (XpGrant unique constraint + Match.xpGranted flag)
- New UI: XpPanel, PlayerStatusBadge, EventHistoryPanel components
- New API: /api/user/profile, /api/user/xp-history
- 154 tests pass, 0 lint errors

---
Task ID: v4-penalty-and-bonus
Agent: Super Z (main)
Task: Rename "Pênalti" play to "Chute na Marca do Pênalti"; restrict penalties to foul-in-area only; let user choose penalty taker with random per-player bonus markers; per-play random bonus markers (no fixed advantage); substituted players must not reappear during a match.

Work Log:
- Renamed s12 from "Pênalti" to "Chute na Marca do Pênalti" with new description: "O jogador está dentro da área e faz um chute na distância da marca do pênalti."
- Filtered s12 and pk* actions out of sampleMixedActions (they only appear via penalty kick flow).
- Added new PENALTY_KICK_ACTIONS array with 4 penalty-specific plays (pk01-pk04): Chute na Marca do Pênalti, Cavadinha no Pênalti, Chute Forte no Pênalti, Chute Colocado no Pênalti.
- Added samplePenaltyKickActions(count) function to return only penalty plays.
- Added `inArea?: boolean` field to PenaltyEvent interface.
- Refactored generatePenaltyEvent: PENALTY_KICK no longer generated directly from low dice rolls — instead, FOUL events have a 10-25% chance of being inside the area (inArea=true), which then gets upgraded to PENALTY_KICK in applyActionToState.
- Added the same FOUL→PENALTY_KICK upgrade logic to the crit_fail path.
- Added preparePenaltyKick(candidates, favoredPossession) in free-kick-system.ts: returns ALL eligible takers (user chooses), each with an independently-rolled random bonus marker (BONUS/PENALTY/NEUTRAL). Re-rolled on every call — no fixed advantage per player.
- Added rollPlayBonusMarker(forcedValue?) in free-kick-system.ts: per-play random bonus for normal actions (60% neutral, 25% bonus, 15% penalty, range -2 to +3). Server-side anti-cheat.
- Updated PendingFreeKickState: `assignment` is now optional (missing for penalty kicks); added `penaltyKickPrep` field and `isPenaltyKick` flag.
- Updated /api/match/action: branches on PENALTY_KICK (uses preparePenaltyKick + persists eligible takers) vs FOUL/free kick (uses assignFreeKick + persists auto-picked taker). Also generates a per-play bonus marker for every PLAY_ACTION and applies it as extraBonus to resolveAction.
- Updated /api/match/free-kick-resolve: accepts optional `takerId` in body. For penalty kicks, validates takerId is in eligibleTakers (anti-cheat) and uses that taker's bonus marker. For regular free kicks, uses the pre-assigned taker and multiplier.
- Updated /api/match/state: returns different payload shape for penalty kick (eligibleTakers) vs free kick (multiplier + taker).
- Rewrote FreeKickDialog with two modes: (1) penalty kick mode shows taker selector with per-player random bonus markers, then play selector; (2) free kick mode shows auto-picked taker + multiplier, then play selector.
- Updated MatchArena pendingFreeKickInfo state type to support both modes (isPenaltyKick, eligibleTakers, optional multiplier/taker).
- Updated MatchArena handleFreeKickPlay to accept (actionId, takerId?) and pass takerId to the resolve endpoint.
- Added per-play bonus marker toast display in MatchArena (success for BONUS, error for PENALTY) for both normal plays and penalty-event plays.
- Fixed substituted players reappearing: activeStarters filter now checks substitutedOut array AND playerStates status (excludes INJURED, SUBSTITUTED, SENT_OFF, UNAVAILABLE in addition to legacy arrays). Updated pickPlayerForAction callers to use activeStarters instead of storeStarters.
- Added 16 new tests (4 for sampleMixedActions filtering of s12/pk, 3 for samplePenaltyKickActions, 6 for preparePenaltyKick, 5 for rollPlayBonusMarker).
- All 170 tests pass (was 154 before).
- Lint: 0 errors on changed files.
- Build: `next build` succeeds with no errors.

Stage Summary:
- "Pênalti" play renamed to "Chute na Marca do Pênalti" with correct description (player inside the area, shooting from penalty mark distance).
- Penalties now ONLY happen when a FOUL is generated with inArea=true (10-25% of fouls), making them logically flow from fouls in the area — never random.
- User chooses the penalty taker from a list of eligible players, each with a randomly-rolled bonus marker (positive OR negative). Markers are re-rolled on every penalty — no fixed advantage per player.
- Per-play random bonus marker system applies to ALL plays (server-side, anti-cheat). 60% neutral, 25% bonus (+1 to +3), 15% penalty (-1 to -2). Re-rolled every play.
- Substituted players no longer reappear during a match — activeStarters filter now checks substitutedOut, playerStates status, and the legacy injured/sentOff arrays.
- 170 tests pass, 0 lint errors, build succeeds.
