// =====================================================================
// lib/sportsdb.ts - Resolução da chave da API TheSportsDB
// --------------------------------------------------------------------
// IMPORTANTE: a antiga chave pública de testes "3" foi desativada
// permanentemente pela TheSportsDB. Qualquer requisição feita com ela
// retorna um erro silencioso (corpo de texto em vez de JSON), o que
// fazia TODAS as buscas de jogadores retornarem zero resultados.
//
// A nova chave pública de testes é "123" (limites do free tier).
// Se você tiver uma key premium, defina THESPORTSDB_API_KEY no .env /
// painel da Vercel — ela será usada com prioridade.
//
// Este helper centraliza a resolução da chave para as rotas
// /api/players/search, /api/players/stats e /api/players/ogol,
// mantendo um único ponto de configuração.
// =====================================================================

/** Nova chave pública de testes da TheSportsDB (free tier). */
const SPORTSDB_TEST_KEY = '123'

/** Chaves legadas sabidamente desativadas pela TheSportsDB. */
const SPORTSDB_DEAD_KEYS = new Set(['3', ''])

/**
 * Retorna a chave da TheSportsDB a ser usada nas requisições.
 *
 * Prioridade:
 *   1. THESPORTSDB_API_KEY do ambiente (se válida e não legada)
 *   2. Chave de testes "123" (fallback público)
 *
 * Se o ambiente ainda estiver configurado com a chave morta "3",
 * caímos para "123" automaticamente (com aviso no log) para que o
 * deploy continue funcionando mesmo antes da variável ser atualizada
 * no painel da Vercel.
 */
export function getSportsDbKey(): string {
  const configured = (process.env.THESPORTSDB_API_KEY || '').trim()
  if (!SPORTSDB_DEAD_KEYS.has(configured)) {
    return configured
  }
  if (configured) {
    console.warn(
      '[sportsdb] THESPORTSDB_API_KEY="' + configured + '" foi desativada pela TheSportsDB. ' +
        'Usando a chave de testes "' + SPORTSDB_TEST_KEY + '". ' +
        'Atualize a variável no .env / painel da Vercel para remover este aviso.',
    )
  }
  return SPORTSDB_TEST_KEY
}

/** Monta a URL de busca de jogadores da TheSportsDB. */
export function sportsDbSearchUrl(query: string): string {
  return `https://www.thesportsdb.com/api/v1/json/${getSportsDbKey()}/searchplayers.php?p=${encodeURIComponent(query)}`
}
