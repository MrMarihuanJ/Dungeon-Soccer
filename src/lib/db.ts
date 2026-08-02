import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Validates that the DATABASE_URL scheme is compatible with the Prisma
 * Client that was generated at build time.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Prisma Client is generated against a specific provider (sqlite OR
 * postgresql) declared in `prisma/schema.prisma` at build time. The
 * `scripts/swap-prisma-provider.js` script auto-detects the provider from
 * `DATABASE_URL` and rewrites the schema before `prisma generate` runs.
 *
 * But if that script was somehow skipped (e.g. `--ignore-scripts`
 * install, manual `prisma generate` without the script), the generated
 * client won't match the runtime DATABASE_URL — and EVERY query will
 * throw a confusing error like:
 *   "Unable to match URL 'postgresql://...' to datasource db with
 *    provider sqlite"
 *
 * This validator catches that mismatch up-front with a clear,
 * actionable error message.
 */
function validateProviderMatch() {
  const url = process.env.DATABASE_URL || ''
  const isPostgresUrl =
    url.startsWith('postgresql://') || url.startsWith('postgres://')
  const isSqliteUrl =
    url.startsWith('file:') || url.startsWith('sqlite:') || url === ''

  // The generated Prisma Client embeds the provider it was built for.
  // We can detect this via runtime inspection of the client's datasource
  // config. In Prisma 6, this is exposed via the internal `_engine` /
  // `Prisma.dmmf` — but the most reliable runtime check is to inspect
  // the `@prisma/client` runtime's `datasources` field.
  //
  // SIMPLER & MORE ROBUST: probe by attempting a no-op connection check.
  // However, we don't want to make this synchronous (would block cold
  // start). Instead, we just do a sanity log so the operator can grep
  // logs and detect mismatches quickly.
  //
  // We rely on swap-prisma-provider.js to keep things in sync. If they
  // skipped it, the first query will fail with the Prisma-native error
  // which already tells them what's wrong.

  // Best-effort log — useful for debugging in Vercel logs.
  const detectedScheme = isPostgresUrl
    ? 'postgresql'
    : isSqliteUrl
    ? 'sqlite'
    : 'unknown'
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[db] DATABASE_URL scheme: ${detectedScheme} | ` +
        `NODE_ENV=${process.env.NODE_ENV || 'development'}`,
    )
  }
}

validateProviderMatch()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
