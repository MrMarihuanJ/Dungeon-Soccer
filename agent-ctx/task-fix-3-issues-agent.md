# Task: Fix 3 Critical Issues in Dungeon Soccer Match Engine

## Summary

All three critical issues have been successfully fixed. TypeScript compilation passes with zero errors and the build succeeds.

## Files Modified

### 1. `src/lib/dnd-actions.ts`
- Modified `sampleMixedActions()` to exclude DEFEND category from normal action draws

### 2. `src/lib/match-engine.ts`
- Added `PlayerPenaltyMultiplier` interface
- Added `penaltyMultipliers` field to `MatchState`
- Modified `generatePenaltyEvent()` to accept `currentProgress` parameter
- Removed PENALTY_KICK from random generation, replaced with FOUL + area upgrade logic
- Added FREE_KICK goalChance branch with midfield check (progress > 50) and multiplier
- Added `generatePenaltyMultipliers()` function
- Updated `createInitialMatchState()` to include `penaltyMultipliers: []`

### 3. `src/lib/sound.ts` (NEW)
- Created `playWhistleSound()` and `playGoalSound()` using Web Audio API

### 4. `src/components/match/MatchArena.tsx`
- Added `DEFEND_OPPORTUNITY` phase with 30% defensive opportunity check
- Added `handleDefendAction()` function
- Added whistle/goal sound calls
- Added penalty kick detection and FreeKickDialog props

### 5. `src/components/match/FreeKickDialog.tsx`
- Added `isPenaltyKick` and `penaltyMultipliers` props
- Penalty kick shows "PÊNALTI!" header with red accent, multiplier badges

### 6. `src/app/api/match/action/route.ts`
- Added `PlayerPenaltyMultiplier` type import and penaltyMultipliers field

## Verification
- tsc --noEmit: ✅ Zero TypeScript errors
- npm run build: ✅ Build succeeds
- bun run lint: ✅ Only pre-existing warnings, no new errors
