// =====================================================================
// Auth Library - Sistema de autenticação simples com HMAC + cookie
// --------------------------------------------------------------------
// - Tokens são JSON assinados com HMAC-SHA256 (sem dependências extras)
// - Cookie HTTP-only, SameSite=Lax, Secure em produção
// - Credenciais admin via variáveis de ambiente
// =====================================================================

import crypto from 'crypto'

const COOKIE_NAME = 'dungeon_admin_session'
const TOKEN_TTL_SECONDS = 60 * 60 * 8 // 8 horas

function getSecret(): string {
  // Em produção, JWT_SECRET é OBRIGATÓRIO. Sem ele, tokens admin podem ser
  // forjados por qualquer um que conheça a string pública de fallback.
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: JWT_SECRET (ou AUTH_SECRET) não configurado em produção.',
      )
    }
    console.warn(
      '[auth] AVISO: JWT_SECRET não configurado. Usando fallback de DEV.',
    )
    return 'dev-secret-change-in-production-please'
  }
  if (secret.length < 16) {
    throw new Error('JWT_SECRET muito curto (mínimo 16 caracteres).')
  }
  return secret
}

export interface AdminPayload {
  username: string
  role: 'admin'
  iat: number
  exp: number
}

export function signToken(payload: Omit<AdminPayload, 'iat' | 'exp' | 'role'>): string {
  const now = Math.floor(Date.now() / 1000)
  const full: AdminPayload = {
    ...payload,
    role: 'admin',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }
  const data = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token: string | undefined | null): AdminPayload | null {
  if (!token) return null
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
    // Constant-time comparison to avoid timing attacks
    if (sig.length !== expectedSig.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as AdminPayload
    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    if (payload.role !== 'admin') return null
    return payload
  } catch {
    return null
  }
}

export function getAdminCredentials(): { username: string; password: string } {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  // Em produção, recusar usar defaults públicos
  if (process.env.NODE_ENV === 'production') {
    if (!password || password === 'admin123' || password.length < 8) {
      throw new Error(
        'FATAL: ADMIN_PASSWORD não configurado ou inseguro em produção. ' +
        'Deve ter ao menos 8 caracteres e não ser o default.',
      )
    }
    if (!username) {
      throw new Error('FATAL: ADMIN_USERNAME não configurado em produção.')
    }
  }
  return {
    username: username || 'admin',
    password: password || 'admin123',
  }
}

export function verifyCredentials(username: string, password: string): boolean {
  const creds = getAdminCredentials()
  // Rejeitar inputs que excedam o tamanho esperado antes de chamar timingSafeEqual
  // (que lançaria RangeError em buffers de tamanhos diferentes)
  if (username.length > 256 || password.length > 256) return false
  if (username.length !== creds.username.length) return false
  if (password.length !== creds.password.length) return false
  try {
    const uMatch = crypto.timingSafeEqual(
      Buffer.from(username),
      Buffer.from(creds.username),
    )
    const pMatch = crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(creds.password),
    )
    return uMatch && pMatch
  } catch {
    return false
  }
}

export const ADMIN_COOKIE = COOKIE_NAME

export function buildCookieHeader(token: string): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${TOKEN_TTL_SECONDS}`,
  ]
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }
  return parts.join('; ')
}

export function buildClearCookieHeader(): string {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }
  return parts.join('; ')
}

// Helper para ler cookie do header Cookie em uma API route
export function readTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    }),
  )
  return cookies[COOKIE_NAME] || null
}

// Helper para servidor: ler payload admin a partir do Request
export function getAdminFromRequest(req: Request): AdminPayload | null {
  const token = readTokenFromRequest(req)
  return verifyToken(token)
}
