// =====================================================================
// lib/db-sync.ts - Auto-sync do banco de dados (Neon-compatible)
// --------------------------------------------------------------------
// Garante que todas as tabelas e colunas necessárias existam.
// Usa PL/pgSQL DO blocks para executar múltiplos DDL em uma única
// chamada $executeRawUnsafe — Neon PostgreSQL aceita DO blocks como
// um único comando prepared statement.
//
// PERFORMANCE: Reduziu de 30+ chamadas SQL individuais para ~5
// chamadas (4 DO blocks + 1 query de ghost columns), eliminando
// o timeout 504 em Vercel serverless + Neon cold start.
//
// CORREÇÃO PRINCIPAL (v2):
//   A versão anterior NÃO adicionava várias colunas novas do schema
//   (lastLoginAt, isAdmin, isProtected em User; xpGranted, version,
//    pendingPenaltyEventJson, varDecisionsJson, homeTeamJson,
//    awayTeamJson em Match; overall/age/pace/... em Player para DBs
//    antigos) e NÃO criava a tabela XpGrant. Isso causava erro 500
//    em login, team save, match create e admin/players.
//   Agora TODAS as colunas do schema são garantidas via
//   ADD COLUMN IF NOT EXISTS, e a tabela XpGrant é criada.
// =====================================================================

import { db } from './db'

let syncPromise: Promise<void> | null = null
let syncDone = false

// =====================================================
// DO block 1: CREATE TABLE IF NOT EXISTS (todas as tabelas, incluindo XpGrant)
// =====================================================
// Um DO block é UM único comando SQL do ponto de vista do
// PostgreSQL prepared statement — compatível com Neon.
const CREATE_TABLES_SQL = `
DO $$ BEGIN
  -- Tabela User
  CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  );

  -- Tabela UserTeam
  CREATE TABLE IF NOT EXISTS "UserTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Meu Time',
    "formation" TEXT NOT NULL,
    "starters" TEXT NOT NULL,
    "reserves" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id")
  );

  -- Tabela SavedTeam (legacy)
  CREATE TABLE IF NOT EXISTS "SavedTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formation" TEXT NOT NULL,
    "starters" TEXT NOT NULL,
    "reserves" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedTeam_pkey" PRIMARY KEY ("id")
  );

  -- Tabela Player (com TODAS as colunas de rating)
  CREATE TABLE IF NOT EXISTS "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "photoUrl" TEXT,
    "nationality" TEXT,
    "shirtNumber" INTEGER,
    "value" DOUBLE PRECISION,
    "overall" INTEGER NOT NULL DEFAULT 75,
    "age" INTEGER NOT NULL DEFAULT 25,
    "pace" INTEGER NOT NULL DEFAULT 70,
    "shooting" INTEGER NOT NULL DEFAULT 70,
    "passing" INTEGER NOT NULL DEFAULT 70,
    "dribbling" INTEGER NOT NULL DEFAULT 70,
    "defending" INTEGER NOT NULL DEFAULT 70,
    "physical" INTEGER NOT NULL DEFAULT 70,
    "leagueTier" TEXT NOT NULL DEFAULT 'BR1',
    "isRetired" BOOLEAN NOT NULL DEFAULT false,
    "isInactive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
  );

  -- Tabela Friendship
  CREATE TABLE IF NOT EXISTS "Friendship" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
  );

  -- Tabela FriendRequest
  CREATE TABLE IF NOT EXISTS "FriendRequest" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
  );

  -- Tabela Match (completa com TODAS as colunas do schema, incluindo as novas)
  CREATE TABLE IF NOT EXISTS "Match" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "mode" TEXT NOT NULL DEFAULT 'DREAM_TEAM',
    "gameMode" TEXT NOT NULL DEFAULT 'QUICK_MATCH',
    "inviteCode" TEXT,
    "isOffline" BOOLEAN NOT NULL DEFAULT false,
    "coinResult" TEXT,
    "startingUserId" TEXT,
    "homeUserId" TEXT NOT NULL,
    "awayUserId" TEXT,
    "currentPossession" TEXT,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "winner" TEXT,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "homeProgress" INTEGER NOT NULL DEFAULT 0,
    "awayProgress" INTEGER NOT NULL DEFAULT 0,
    "eventsJson" TEXT NOT NULL DEFAULT '[]',
    "homeTeamStateJson" TEXT NOT NULL DEFAULT '{}',
    "awayTeamStateJson" TEXT NOT NULL DEFAULT '{}',
    "homeTeamRating" INTEGER,
    "awayTeamRating" INTEGER,
    "matchStartedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "totalPausedMs" INTEGER NOT NULL DEFAULT 0,
    "halftimeTaken" BOOLEAN NOT NULL DEFAULT false,
    "secondHalfStartedAt" TIMESTAMP(3),
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "turnStartedAt" TIMESTAMP(3),
    "xpGranted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "pendingPenaltyEventJson" TEXT,
    "varDecisionsJson" TEXT NOT NULL DEFAULT '[]',
    "homeTeamJson" TEXT,
    "awayTeamJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
  );

  -- Tabela XpGrant (NOVA — controla idempotência de concessão de XP)
  CREATE TABLE IF NOT EXISTS "XpGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'XP',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpGrant_pkey" PRIMARY KEY ("id")
  );
END $$;
`

// =====================================================
// DO block 2: ADD COLUMN IF NOT EXISTS + CREATE INDEX
// =====================================================
// Garante que TODAS as colunas do schema existam, mesmo em DBs
// criados por versões antigas do db-sync. ADD COLUMN IF NOT EXISTS
// é no-op para colunas que já existem.
const ADD_COLUMNS_AND_INDEXES_SQL = `
DO $$ BEGIN
  -- ===== User: TODAS as colunas =====
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isProtected" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wins" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "losses" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "draws" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "xp" INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
  CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

  -- ===== UserTeam =====
  ALTER TABLE "UserTeam" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT true;
  CREATE INDEX IF NOT EXISTS "UserTeam_userId_idx" ON "UserTeam"("userId");

  -- ===== Player: TODAS as colunas de rating (ADD COLUMN IF NOT EXISTS
  -- é crucial para DBs antigos que só tinham as colunas básicas) =====
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "overall" INTEGER NOT NULL DEFAULT 75;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "age" INTEGER NOT NULL DEFAULT 25;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "pace" INTEGER NOT NULL DEFAULT 70;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "shooting" INTEGER NOT NULL DEFAULT 70;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "passing" INTEGER NOT NULL DEFAULT 70;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dribbling" INTEGER NOT NULL DEFAULT 70;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "defending" INTEGER NOT NULL DEFAULT 70;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "physical" INTEGER NOT NULL DEFAULT 70;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "leagueTier" TEXT NOT NULL DEFAULT 'BR1';
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "isRetired" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "isInactive" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "nationality" TEXT;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "shirtNumber" INTEGER;
  ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "value" DOUBLE PRECISION;
  CREATE INDEX IF NOT EXISTS "Player_name_idx" ON "Player"("name");
  CREATE INDEX IF NOT EXISTS "Player_team_idx" ON "Player"("team");
  CREATE INDEX IF NOT EXISTS "Player_position_idx" ON "Player"("position");
  CREATE INDEX IF NOT EXISTS "Player_overall_idx" ON "Player"("overall");
  CREATE INDEX IF NOT EXISTS "Player_isRetired_idx" ON "Player"("isRetired");

  -- ===== Friendship =====
  ALTER TABLE "Friendship" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACCEPTED';
  CREATE INDEX IF NOT EXISTS "Friendship_userBId_idx" ON "Friendship"("userBId");
  CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");

  -- ===== FriendRequest =====
  CREATE INDEX IF NOT EXISTS "FriendRequest_toUserId_idx" ON "FriendRequest"("toUserId");
  CREATE UNIQUE INDEX IF NOT EXISTS "FriendRequest_fromUserId_toUserId_key" ON "FriendRequest"("fromUserId", "toUserId");

  -- ===== Match: TODAS as colunas, incluindo as novas (xpGranted, version,
  -- pendingPenaltyEventJson, varDecisionsJson, homeTeamJson, awayTeamJson) =====
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COIN_FLIP';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'DREAM_TEAM';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "gameMode" TEXT NOT NULL DEFAULT 'QUICK_MATCH';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "isOffline" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "coinResult" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "startingUserId" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "currentPossession" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeScore" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayScore" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "winner" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "turnCount" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeProgress" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayProgress" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "eventsJson" TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeTeamStateJson" TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayTeamStateJson" TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeTeamRating" INTEGER;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayTeamRating" INTEGER;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "matchStartedAt" TIMESTAMP(3);
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "totalPausedMs" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "halftimeTaken" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "secondHalfStartedAt" TIMESTAMP(3);
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "xpReward" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "turnStartedAt" TIMESTAMP(3);
  -- ===== COLUNAS NOVAS (não existiam no db-sync anterior) =====
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "xpGranted" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "pendingPenaltyEventJson" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "varDecisionsJson" TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeTeamJson" TEXT;
  ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayTeamJson" TEXT;
  -- Make awayUserId nullable (Prisma schema has String? not String)
  ALTER TABLE "Match" ALTER COLUMN "awayUserId" DROP NOT NULL;
  -- Indexes
  CREATE INDEX IF NOT EXISTS "Match_homeUserId_idx" ON "Match"("homeUserId");
  CREATE INDEX IF NOT EXISTS "Match_awayUserId_idx" ON "Match"("awayUserId");
  CREATE UNIQUE INDEX IF NOT EXISTS "Match_inviteCode_key" ON "Match"("inviteCode");
  CREATE INDEX IF NOT EXISTS "Match_xpGranted_idx" ON "Match"("xpGranted");
  CREATE INDEX IF NOT EXISTS "Match_version_idx" ON "Match"("version");

  -- ===== XpGrant: índices + constraint unique =====
  CREATE UNIQUE INDEX IF NOT EXISTS "XpGrant_userId_source_key" ON "XpGrant"("userId", "source");
  CREATE INDEX IF NOT EXISTS "XpGrant_userId_idx" ON "XpGrant"("userId");
  CREATE INDEX IF NOT EXISTS "XpGrant_source_idx" ON "XpGrant"("source");
END $$;
`

// =====================================================
// DO block 3: FK creation
// =====================================================
const FK_SETUP_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Match_homeUserId_fkey' AND table_name = 'Match') THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_homeUserId_fkey" FOREIGN KEY ("homeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Match_awayUserId_fkey' AND table_name = 'Match') THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_awayUserId_fkey" FOREIGN KEY ("awayUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Friendship_userAId_fkey' AND table_name = 'Friendship') THEN
    ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Friendship_userBId_fkey' AND table_name = 'Friendship') THEN
    ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FriendRequest_fromUserId_fkey' AND table_name = 'FriendRequest') THEN
    ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FriendRequest_toUserId_fkey' AND table_name = 'FriendRequest') THEN
    ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'UserTeam_userId_fkey' AND table_name = 'UserTeam') THEN
    ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'XpGrant_userId_fkey' AND table_name = 'XpGrant') THEN
    ALTER TABLE "XpGrant" ADD CONSTRAINT "XpGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$
`

/**
 * Detecta se o banco configurado é PostgreSQL (Neon) ou outro (ex.: SQLite
 * usado em testes locais/sandbox). O db-sync só executa DDL bruto em Postgres;
 * em SQLite, as migrações são feitas via `prisma db push`.
 */
function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgresql://') || url.startsWith('postgres://')
}

/**
 * Auto-seed: se a tabela Player estiver vazia, popula com PLAYERS_SEED.
 * Roda tanto para Postgres quanto para SQLite. Garante que o admin
 * sempre veja jogadores após um deploy fresco ou DB reset.
 *
 * IDEMPOTENTE: se já existir ao menos 1 jogador, não faz nada.
 */
async function autoSeedPlayersIfEmpty(): Promise<void> {
  try {
    const count = await db.player.count()
    if (count > 0) {
      return
    }
    // Import dinâmico para evitar carregar o módulo em cold starts onde
    // o sync falha cedo (ex.: DB indisponível).
    const { PLAYERS_SEED } = await import('./football/players-data')
    console.log(`[db-sync] Player table empty — auto-seeding ${PLAYERS_SEED.length} players...`)

    // Usa createMany (mais rápido que loop de create) — Prisma suporta
    // para SQLite e Postgres. Pula conflitos via skipDuplicates.
    await db.player.createMany({
      data: PLAYERS_SEED.map((p) => ({
        name: p.name,
        fullName: p.fullName,
        position: p.position,
        team: p.team,
        photoUrl: p.photoUrl,
        nationality: p.nationality,
        shirtNumber: p.shirtNumber ?? null,
        overall: p.overall,
        age: p.age,
        pace: p.pace ?? 70,
        shooting: p.shooting ?? 70,
        passing: p.passing ?? 70,
        dribbling: p.dribbling ?? 70,
        defending: p.defending ?? 70,
        physical: p.physical ?? 70,
        leagueTier: p.leagueTier ?? 'OTHER',
        isRetired: p.isRetired ?? false,
        isInactive: p.isInactive ?? false,
      })),
      skipDuplicates: true,
    })
    console.log('[db-sync] Auto-seed concluído.')
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error(`[db-sync] Auto-seed falhou (não fatal): ${msg.slice(0, 300)}`)
    // Não propagamos o erro — o sync principal ainda pode ter tido sucesso.
  }
}

/**
 * Garante que todas as tabelas existem no banco.
 * Executa apenas uma vez por cold start. Em chamadas subsequentes, retorna imediatamente.
 *
 * PERFORMANCE: Usa 3 PL/pgSQL DO blocks (~4 SQL calls total) em vez de
 * 30+ chamadas individuais, eliminando timeout 504 no Vercel + Neon.
 *
 * COMPAT: Em SQLite (desenvolvimento/testes locais), a parte DDL é
 * no-op — confiamos no `prisma db push` para criar/migrar o schema.
 * O auto-seed de Player roda em ambos (Postgres e SQLite).
 */
export async function ensureDbSync(): Promise<void> {
  if (syncDone) return

  if (!syncPromise) {
    syncPromise = (async () => {
      console.log('[db-sync] Starting DB sync (optimized DO blocks)...')

      if (isPostgres()) {
        // 1. Create all tables (1 DO block = 1 executeRawUnsafe call)
        try {
          await db.$executeRawUnsafe(CREATE_TABLES_SQL)
          console.log('[db-sync] All tables created/verified')
        } catch (err: any) {
          const msg = err?.message || String(err)
          if (msg.includes('already exists')) {
            console.log('[db-sync] Tables already existed — OK')
          } else {
            console.error(`[db-sync] Create tables error: ${msg.slice(0, 300)}`)
          }
        }

        // 2. Add missing columns + indexes (1 DO block = 1 call)
        try {
          await db.$executeRawUnsafe(ADD_COLUMNS_AND_INDEXES_SQL)
          console.log('[db-sync] All columns + indexes added/verified')
        } catch (err: any) {
          const msg = err?.message || String(err)
          if (msg.includes('already exists')) {
            console.log('[db-sync] Columns/indexes already existed — OK')
          } else {
            console.error(`[db-sync] Columns + indexes error: ${msg.slice(0, 300)}`)
          }
        }

        // 3. FK creation (1 DO block = 1 call)
        try {
          await db.$executeRawUnsafe(FK_SETUP_SQL)
          console.log('[db-sync] FK setup completed')
        } catch (err: any) {
          const msg = err?.message || String(err)
          if (msg.includes('already exists')) {
            console.log('[db-sync] FK setup completed (constraints already existed)')
          } else {
            console.error(`[db-sync] FK setup error: ${msg.slice(0, 300)}`)
          }
        }

        // 4. Fix ghost columns in Match table
        // Columns that are NOT NULL without default but NOT in the Prisma schema
        // cause "Null constraint violation" on INSERT
        try {
          const ghostColumns = await db.$queryRaw<Array<{ column_name: string; is_nullable: string; column_default: string | null }>>`
            SELECT column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'Match'
              AND is_nullable = 'NO'
              AND column_default IS NULL
              AND column_name NOT IN (
                'id', 'status', 'mode', 'gameMode', 'homeUserId', 'awayUserId',
                'homeScore', 'awayScore', 'turnCount', 'homeProgress', 'awayProgress',
                'eventsJson', 'homeTeamStateJson', 'awayTeamStateJson',
                'totalPausedMs', 'xpReward', 'createdAt', 'updatedAt', 'isOffline',
                'xpGranted', 'version', 'varDecisionsJson'
              )
          `
          for (const col of ghostColumns) {
            console.log(`[db-sync] Fixing ghost column: Match.${col.column_name} (NOT NULL without default) → making nullable`)
            try {
              await db.$executeRawUnsafe(`ALTER TABLE "Match" ALTER COLUMN "${col.column_name}" DROP NOT NULL`)
            } catch {
              // Column might not exist at all — skip silently
            }
          }
          if (ghostColumns.length === 0) {
            console.log('[db-sync] No ghost columns found in Match table')
          }
        } catch (err: any) {
          const msg = err?.message || String(err)
          console.error('[db-sync] Ghost column check error:', msg.slice(0, 300))
        }
      } else {
        console.log('[db-sync] SQLite detectado — DDL no-op (use `prisma db push`). Auto-seed ainda roda.')
      }

      // 5. Auto-seed Player table if empty (both Postgres and SQLite)
      await autoSeedPlayersIfEmpty()

      syncDone = true
      console.log('[db-sync] Sync completed successfully')
    })()
  }

  await syncPromise
}
