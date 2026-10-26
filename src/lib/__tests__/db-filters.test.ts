// Testes para os filtros Prisma portáveis (Postgres e SQLite)
// --------------------------------------------------------------------
// Cobre a correção do bug em que `mode: 'insensitive'` (apenas
// PostgreSQL) fazia a busca local de jogadores lançar
// "Unknown argument `mode`" no SQLite, retornando sempre vazio.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { containsInsensitive, isPostgres } from '../db-filters'

describe('db-filters (Postgres vs SQLite)', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.DATABASE_URL
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  describe('isPostgres', () => {
    it('detecta connection string do Neon (postgresql://)', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-xyz.neon.tech/db?sslmode=require'
      expect(isPostgres()).toBe(true)
    })

    it('detecta scheme postgres:// legado', () => {
      process.env.DATABASE_URL = 'postgres://user:pass@host/db'
      expect(isPostgres()).toBe(true)
    })

    it('detecta SQLite via file:', () => {
      process.env.DATABASE_URL = 'file:./dev.db'
      expect(isPostgres()).toBe(false)
    })

    it('trata DATABASE_URL ausente como não-Postgres', () => {
      expect(isPostgres()).toBe(false)
    })
  })

  describe('containsInsensitive', () => {
    it('no Postgres, inclui mode insensitive (necessário para LIKE)', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-xyz.neon.tech/db'
      expect(containsInsensitive('neymar')).toEqual({
        contains: 'neymar',
        mode: 'insensitive',
      })
    })

    it('no SQLite, OMITE o mode (argumento não suportado pelo Prisma)', () => {
      process.env.DATABASE_URL = 'file:./dev.db'
      expect(containsInsensitive('neymar')).toEqual({ contains: 'neymar' })
      expect(containsInsensitive('neymar').mode).toBeUndefined()
    })

    it('sem DATABASE_URL, omite o mode (fallback seguro para dev)', () => {
      expect(containsInsensitive('teste')).toEqual({ contains: 'teste' })
    })
  })
})
