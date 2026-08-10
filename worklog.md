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
