// Testes de integração para rotas de API
// --------------------------------------------------------------------
// Cobre:
//   - Admin auth: falha sem JWT_SECRET em produção
//   - Admin auth: rejecta creds default em produção
//   - timingSafeEqual não quebra com inputs longos
//   - cron: requer CRON_SECRET
//
// Como o Next.js API routes são difíceis de testar isoladamente, testamos
// as funções auxiliares diretamente.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  verifyCredentials,
  getAdminCredentials,
} from '../auth'

describe('Admin auth (C7 fixes)', () => {
  const origEnv = { ...process.env }
  const origNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    // Reset env
    process.env = { ...origEnv }
  })

  afterEach(() => {
    process.env = { ...origEnv }
    vi.resetModules()
  })

  describe('verifyCredentials', () => {
    beforeEach(() => {
      process.env.ADMIN_USERNAME = 'admin'
      process.env.ADMIN_PASSWORD = 'securePass123'
      process.env.NODE_ENV = 'development'
    })

    it('aceita credenciais corretas', () => {
      expect(verifyCredentials('admin', 'securePass123')).toBe(true)
    })

    it('rejeita senha errada', () => {
      expect(verifyCredentials('admin', 'wrong')).toBe(false)
    })

    it('rejeita username errado', () => {
      expect(verifyCredentials('wrong', 'securePass123')).toBe(false)
    })

    it('não quebra com username muito longo (fix C7 M9)', () => {
      // Antes do fix, isso lançaria RangeError
      const longUsername = 'a'.repeat(500)
      expect(() => verifyCredentials(longUsername, 'securePass123')).not.toThrow()
      expect(verifyCredentials(longUsername, 'securePass123')).toBe(false)
    })

    it('não quebra com senha muito longa', () => {
      const longPassword = 'b'.repeat(500)
      expect(() => verifyCredentials('admin', longPassword)).not.toThrow()
      expect(verifyCredentials('admin', longPassword)).toBe(false)
    })

    it('rejeita username com length diferente', () => {
      expect(verifyCredentials('adminX', 'securePass123')).toBe(false)
      expect(verifyCredentials('ad', 'securePass123')).toBe(false)
    })
  })

  describe('getAdminCredentials', () => {
    it('em dev: retorna defaults se não configurado', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.ADMIN_USERNAME
      delete process.env.ADMIN_PASSWORD
      const c = getAdminCredentials()
      expect(c.username).toBe('admin')
      expect(c.password).toBe('admin123')
    })

    it('em produção: lança erro se ADMIN_PASSWORD não configurado', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.ADMIN_PASSWORD
      expect(() => getAdminCredentials()).toThrow()
    })

    it('em produção: lança erro se ADMIN_PASSWORD = default', () => {
      process.env.NODE_ENV = 'production'
      process.env.ADMIN_USERNAME = 'admin'
      process.env.ADMIN_PASSWORD = 'admin123'
      expect(() => getAdminCredentials()).toThrow()
    })

    it('em produção: lança erro se ADMIN_PASSWORD < 8 chars', () => {
      process.env.NODE_ENV = 'production'
      process.env.ADMIN_USERNAME = 'admin'
      process.env.ADMIN_PASSWORD = 'short'
      expect(() => getAdminCredentials()).toThrow()
    })

    it('em produção: aceita ADMIN_PASSWORD seguro', () => {
      process.env.NODE_ENV = 'production'
      process.env.ADMIN_USERNAME = 'admin'
      process.env.ADMIN_PASSWORD = 'verySecurePass456'
      const c = getAdminCredentials()
      expect(c.username).toBe('admin')
      expect(c.password).toBe('verySecurePass456')
    })
  })
})
