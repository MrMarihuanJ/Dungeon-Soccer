// Testes para a resolução da chave da TheSportsDB
// --------------------------------------------------------------------
// Cobre a correção do bug de produção em que TODAS as buscas de
// jogadores retornavam zero resultados:
//   - A antiga chave pública "3" foi desativada permanentemente
//     pela TheSportsDB.
//   - O código fazia fallback para "3" quando THESPORTSDB_API_KEY
//     não estava configurada.
//   - A resposta de erro (texto plano, sem campo `player`) era
//     interpretada como "sem resultados".
//
// O helper getSportsDbKey() agora mapeia a chave morta "3" para a
// nova chave de testes "123" automaticamente.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSportsDbKey, sportsDbSearchUrl } from '../sportsdb'

describe('sportsdb key resolution', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.THESPORTSDB_API_KEY
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  it('usa a nova chave de testes quando a variável não está configurada', () => {
    expect(getSportsDbKey()).toBe('123')
  })

  it('substitui a chave legada desativada "3" pela nova "123"', () => {
    process.env.THESPORTSDB_API_KEY = '3'
    expect(getSportsDbKey()).toBe('123')
  })

  it('trata string vazia como não configurada (fallback para "123")', () => {
    process.env.THESPORTSDB_API_KEY = ''
    expect(getSportsDbKey()).toBe('123')
  })

  it('trata string com espaços como não configurada', () => {
    process.env.THESPORTSDB_API_KEY = '   '
    expect(getSportsDbKey()).toBe('123')
  })

  it('preserva uma chave premium válida configurada pelo usuário', () => {
    process.env.THESPORTSDB_API_KEY = 'minha-key-premium-abc'
    expect(getSportsDbKey()).toBe('minha-key-premium-abc')
  })

  it('monta a URL de busca com a chave resolvida e o termo codificado', () => {
    process.env.THESPORTSDB_API_KEY = 'minha-key'
    const url = sportsDbSearchUrl('Neymar Jr')
    expect(url).toBe(
      'https://www.thesportsdb.com/api/v1/json/minha-key/searchplayers.php?p=Neymar%20Jr',
    )
  })

  it('URL usa a chave "123" quando nada está configurado', () => {
    const url = sportsDbSearchUrl('pelé')
    expect(url).toContain('/json/123/searchplayers.php?p=pel%C3%A9')
  })
})
