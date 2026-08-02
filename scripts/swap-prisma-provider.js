#!/usr/bin/env node
// =====================================================================
// scripts/swap-prisma-provider.js
// ---------------------------------------------------------------------
// AUTO-DETECTS the database provider from DATABASE_URL and rewrites
// `prisma/schema.prisma` so the correct Prisma Client is generated.
//
// WHY THIS EXISTS
// ---------------
// The previous hotfix (v2) only fixed DDL via `$executeRawUnsafe`, which
// bypasses Prisma Client. But ALL data queries (`db.user.findFirst`,
// `db.userTeam.create`, `db.match.create`, `db.player.findMany`, etc.)
// go through the Prisma Client, which is generated against the provider
// declared in `prisma/schema.prisma`.
//
// If schema.prisma says `provider = "sqlite"` (the dev default) but
// production's DATABASE_URL is `postgresql://...`, Prisma throws at
// query time:
//   "Unable to match URL 'postgresql://...' to datasource db with
//    provider sqlite"
//
// This was the REAL root cause of all 4 production errors:
//   H1. "Erro interno no login"            -> db.user.findFirst failed
//   H2. "Erro ao salvar o time"             -> db.userTeam.upsert failed
//   H3. "Erro ao iniciar partida"           -> db.match.create failed
//   H4. "Jogadores sumiram do admin"        -> db.player.findMany failed
//                                              (caught + empty list returned)
//
// This script makes the provider auto-switch so the user no longer needs
// to manually edit `schema.prisma` before deploying to Vercel+Neon.
//
// WHEN IT RUNS
// ------------
//  - `postinstall` (in package.json): BEFORE `prisma generate`, so the
//    generated client matches the actual DATABASE_URL.
//  - `prebuild` (in package.json): safety net in case `postinstall`
//    was skipped (e.g. `--ignore-scripts` install).
//
// BOTH RUNS ARE IDEMPOTENT — running it twice is safe.
// =====================================================================

const fs = require('fs')
const path = require('path')

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma')

function detectProvider() {
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    return 'postgresql'
  }
  // file:./xxx, file:/absolute/xxx, or sqlite:... => sqlite
  if (url.startsWith('file:') || url.startsWith('sqlite:')) {
    return 'sqlite'
  }
  // Empty DATABASE_URL — assume sqlite (dev default)
  if (!url) return 'sqlite'
  // Unknown — fall back to sqlite to avoid breaking dev
  console.warn(
    `[swap-provider] DATABASE_URL has unknown scheme: "${url.slice(0, 40)}..." — defaulting to sqlite`,
  )
  return 'sqlite'
}

function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`[swap-provider] FATAL: schema not found at ${SCHEMA_PATH}`)
    process.exit(1)
  }

  const desiredProvider = detectProvider()
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8')

  // Match ONLY the real `provider = "..."` line INSIDE the datasource block.
  // A line that starts with `//` is a comment and must not be touched.
  // We require the line to begin with optional whitespace then `provider`
  // (no `//` prefix).
  //
  // Match group 1 = leading whitespace, group 2 = current provider value.
  const providerLineRegex = /^([ \t]*)provider[ \t]*=[ \t]*"(sqlite|postgresql)"[ \t]*$/m

  const match = schema.match(providerLineRegex)
  if (!match) {
    console.warn(
      '[swap-provider] Could not find a non-comment `provider = "..."` line — leaving schema unchanged.',
    )
    return
  }

  const currentProvider = match[2]
  if (currentProvider === desiredProvider) {
    console.log(
      `[swap-provider] Schema provider already "${desiredProvider}" — no change needed.`,
    )
    return
  }

  // Replace ONLY the matched line (preserves comments and everything else).
  const newSchema = schema.replace(
    providerLineRegex,
    (_, indent) => `${indent}provider = "${desiredProvider}"`,
  )

  fs.writeFileSync(SCHEMA_PATH, newSchema, 'utf8')
  console.log(
    `[swap-provider] Schema provider updated: "${currentProvider}" -> "${desiredProvider}"`,
  )
}

try {
  main()
} catch (err) {
  console.error('[swap-provider] FATAL:', err)
  process.exit(1)
}
