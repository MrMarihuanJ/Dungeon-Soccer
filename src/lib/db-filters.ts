// =====================================================================
// lib/db-filters.ts - Filtros Prisma compatíveis com Postgres e SQLite
// --------------------------------------------------------------------
// O projeto roda em PostgreSQL (Neon/Vercel, produção) e SQLite (dev e
// testes locais). Nem todo filtro é suportado igualmente nos dois
// providers:
//
//   - `mode: 'insensitive'` (busca sem distinguir maiúsculas) só existe
//     no PostgreSQL. No SQLite, o Prisma lança erro de validação
//     "Unknown argument `mode`" — que fazia a busca LOCAL de jogadores
//     retornar sempre vazio em desenvolvimento, mesmo com o banco
//     populado.
//
// Este helper monta o filtro certo para o provider em uso:
//   - Postgres: adiciona `mode: 'insensitive'` (necessário — o LIKE do
//     Postgres diferencia maiúsculas por padrão).
//   - SQLite: omita o `mode` — o LIKE do SQLite já é case-insensitive
//     para caracteres ASCII, então o comportamento se mantém.
// =====================================================================

/** Detecta se o banco configurado é PostgreSQL (Neon, produção). */
export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || ''
  return url.startsWith('postgresql://') || url.startsWith('postgres://')
}

/**
 * Filtro `contains` case-insensitive portável.
 *
 * Uso:
 *   { name: containsInsensitive(termo) }
 */
export function containsInsensitive(value: string): { contains: string; mode?: 'insensitive' } {
  if (isPostgres()) {
    return { contains: value, mode: 'insensitive' as const }
  }
  // SQLite: LIKE já é case-insensitive para ASCII — não usar `mode`.
  return { contains: value }
}
