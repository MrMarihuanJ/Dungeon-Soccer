-- =====================================================================
-- SQL COMPLETO DE SETUP - Dungeon and Soccer
-- --------------------------------------------------------------------
-- Este script CRIA as tabelas se elas não existirem, e ADICIONA
-- colunas faltantes caso elas já existam com schema antigo.
--
-- IMPORTANTE: Execute TODO este script no "SQL Editor" do Neon Console.
-- O script antigo (sql-update-match.sql) só tinha ALTER TABLE, que
-- falha silenciosamente se a tabela não existe.
-- =====================================================================

-- ===== 1. Garantir que a tabela Match existe (com todas as colunas) =====
CREATE TABLE IF NOT EXISTS "Match" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COIN_FLIP',
  "mode" TEXT NOT NULL DEFAULT 'DREAM_TEAM',
  "gameMode" TEXT NOT NULL DEFAULT 'QUICK_MATCH',
  "coinResult" TEXT,
  "startingUserId" TEXT,
  "homeUserId" TEXT NOT NULL,
  "awayUserId" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- ===== 2. Adicionar colunas faltantes (se a tabela já existia antes) =====
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COIN_FLIP';
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'DREAM_TEAM';
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "coinResult" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "startingUserId" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeUserId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayUserId" TEXT NOT NULL DEFAULT '';
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
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "gameMode" TEXT NOT NULL DEFAULT 'QUICK_MATCH';
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "matchStartedAt" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "totalPausedMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "halftimeTaken" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "secondHalfStartedAt" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "xpReward" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "turnStartedAt" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ===== 3. Garantir colunas no User (wins, losses, draws, xp) =====
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "losses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "draws" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;

-- ===== 4. Garantir tabela Friendship =====
CREATE TABLE IF NOT EXISTS "Friendship" (
  "id" TEXT NOT NULL,
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Friendship_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Friendship_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "Friendship" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "Friendship" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ===== 5. Garantir tabela FriendRequest =====
CREATE TABLE IF NOT EXISTS "FriendRequest" (
  "id" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FriendRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FriendRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "FriendRequest" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "FriendRequest" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ===== 6. Garantir tabela UserTeam =====
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

  CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ===== 7. Garantir tabela SavedTeam (compatibilidade) =====
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

-- ===== 8. Garantir tabela Player =====
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

-- ===== 9. Garantir tabela User =====
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- ===== 10. Foreign keys do Match (só adiciona se não existir) =====
DO $$
BEGIN
  -- FK: Match.homeUserId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Match_homeUserId_fkey' AND table_name = 'Match'
  ) THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_homeUserId_fkey"
      FOREIGN KEY ("homeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: Match.awayUserId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Match_awayUserId_fkey' AND table_name = 'Match'
  ) THEN
    ALTER TABLE "Match" ADD CONSTRAINT "Match_awayUserId_fkey"
      FOREIGN KEY ("awayUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: Friendship.userAId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Friendship_userAId_fkey' AND table_name = 'Friendship'
  ) THEN
    ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userAId_fkey"
      FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: Friendship.userBId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Friendship_userBId_fkey' AND table_name = 'Friendship'
  ) THEN
    ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userBId_fkey"
      FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: FriendRequest.fromUserId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FriendRequest_fromUserId_fkey' AND table_name = 'FriendRequest'
  ) THEN
    ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_fromUserId_fkey"
      FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: FriendRequest.toUserId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'FriendRequest_toUserId_fkey' AND table_name = 'FriendRequest'
  ) THEN
    ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_toUserId_fkey"
      FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- FK: UserTeam.userId -> User.id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'UserTeam_userId_fkey' AND table_name = 'UserTeam'
  ) THEN
    ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ===== 11. Unique constraints =====
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_userAId_userBId_key" ON "Friendship"("userAId", "userBId");
CREATE UNIQUE INDEX IF NOT EXISTS "FriendRequest_fromUserId_toUserId_key" ON "FriendRequest"("fromUserId", "toUserId");

-- ===== 12. Índices =====
CREATE INDEX IF NOT EXISTS "Player_name_idx" ON "Player"("name");
CREATE INDEX IF NOT EXISTS "Player_team_idx" ON "Player"("team");
CREATE INDEX IF NOT EXISTS "Player_position_idx" ON "Player"("position");
CREATE INDEX IF NOT EXISTS "Player_overall_idx" ON "Player"("overall");
CREATE INDEX IF NOT EXISTS "Player_isRetired_idx" ON "Player"("isRetired");
CREATE INDEX IF NOT EXISTS "UserTeam_userId_idx" ON "UserTeam"("userId");
CREATE INDEX IF NOT EXISTS "Match_homeUserId_idx" ON "Match"("homeUserId");
CREATE INDEX IF NOT EXISTS "Match_awayUserId_idx" ON "Match"("awayUserId");
CREATE INDEX IF NOT EXISTS "Friendship_userBId_idx" ON "Friendship"("userBId");
CREATE INDEX IF NOT EXISTS "FriendRequest_toUserId_idx" ON "FriendRequest"("toUserId");

-- ===== 13. Verificação final: lista colunas da tabela Match =====
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Match'
ORDER BY ordinal_position;
