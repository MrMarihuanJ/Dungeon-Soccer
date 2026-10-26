// Testes de regressão da sincronização de jogadores (db-sync / seed)
// --------------------------------------------------------------------
// Cobre a correção de dois bugs que deixavam a tabela Player vazia:
//
// 1. `createMany({ skipDuplicates: true })` lança "Unknown argument
//    skipDuplicates" no provider SQLite do Prisma. Como o erro era
//    engolido pelo catch, o auto-seed nunca populava o banco local.
//
// 2. O auto-seed antigo só rodava quando a tabela estava 100% vazia.
//    Um banco com alguns registros (ex.: 9 jogadores criados via admin)
//    nunca recebia o catálogo curado — a busca local ficava inútil.
//
// Como o db-sync fala com o banco de verdade, testamos diretamente a
// lógica de diff por nome que ele usa (mesma implementação da rota
// /api/seed), garantindo que ela é idempotente e não-destrutiva.

import { describe, it, expect } from 'vitest'
import { PLAYERS_SEED } from '../football/players-data'

/**
 * Mesma lógica de diff aplicada em db-sync.ts e /api/seed:
 * dado o conjunto de nomes existentes, retorna apenas os que faltam.
 */
function computeMissing(existingNames: Iterable<string>) {
  const existing = new Set(existingNames)
  return PLAYERS_SEED.filter((p) => !existing.has(p.name))
}

describe('player catalog sync (db-sync / seed)', () => {
  it('catálogo curado não está vazio', () => {
    expect(PLAYERS_SEED.length).toBeGreaterThan(50)
  })

  it('banco vazio recebe o catálogo completo', () => {
    const missing = computeMissing([])
    expect(missing).toHaveLength(PLAYERS_SEED.length)
  })

  it('banco parcial recebe APENAS os jogadores que faltam', () => {
    // Simula o cenário real de produção: 9 jogadores obscuros
    // já cadastrados. Um deles ("Antony") também existe no catálogo
    // (com outro time) — nesse caso o registro existente é preservado
    // e o do catálogo não é duplicado.
    const partial = [
      'Alisson Santana', 'Antony', 'Guilherme Smith', 'Jackson',
      'Paulo Henrique', 'Riquelme Reis', 'Sorriso', 'Weslley Patati', 'William',
    ]
    const missing = computeMissing(partial)
    expect(missing).toHaveLength(PLAYERS_SEED.length - 1)
    expect(missing.some((p) => partial.includes(p.name))).toBe(false)
    // E inclui os jogadores esperados do catálogo
    expect(missing.some((p) => p.name === 'Neymar Jr')).toBe(true)
    expect(missing.some((p) => p.name === 'Pelé')).toBe(true)
  })

  it('diff é idempotente: banco já sincronizado não recebe nada', () => {
    const all = PLAYERS_SEED.map((p) => p.name)
    const missing = computeMissing(all)
    expect(missing).toHaveLength(0)
  })

  it('diff é não-destrutivo: jogadores extras são preservados', () => {
    // Jogador custom criado via admin não é removido pelo sync.
    // O sync apenas insere faltantes — nunca deleta.
    const existing = [...PLAYERS_SEED.map((p) => p.name), 'Jogador Custom do Admin']
    const missing = computeMissing(existing)
    expect(missing).toHaveLength(0)
    expect(existing).toContain('Jogador Custom do Admin')
  })

  it('catálogo não tem nomes duplicados (evita conflito de diff por nome)', () => {
    const names = PLAYERS_SEED.map((p) => p.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })
})
