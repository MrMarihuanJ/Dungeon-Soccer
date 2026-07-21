// =====================================================================
// User Auth Library - Autenticação individual de usuários
// --------------------------------------------------------------------
// - Senhas com scrypt (N=2^14, r=8, p=1) — seguro e nativo do Node
// - Sessão HMAC-SHA256 em cookie HTTP-only separado do admin
// - 8 horas de TTL
// =====================================================================

import crypto from 'crypto'
import { db } from './db'

const USER_COOKIE_NAME = 'dungeon_user_session'
const USER_TOKEN_TTL = 60 * 60 * 8 // 8 horas

function getSecret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.AUTH_SECRET ||
    'dev-secret-change-in-production-please-use-a-long-random-string'
  )
}

export interface UserSessionPayload {
  userId: string
  username: string
  email: string
  iat: number
  exp: number
}

// -------- Hashing de senha (scrypt) --------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const testHash = crypto
      .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
      .toString('hex')
    // Constant-time comparison
    if (testHash.length !== hash.length) return false
    return crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(hash))
  } catch {
    return false
  }
}

// -------- Token (HMAC-SHA256) --------
export function signUserToken(payload: Omit<UserSessionPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000)
  const full: UserSessionPayload = {
    ...payload,
    iat: now,
    exp: now + USER_TOKEN_TTL,
  }
  const data = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyUserToken(token: string | undefined | null): UserSessionPayload | null {
  if (!token) return null
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null
    const expectedSig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
    if (sig.length !== expectedSig.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as UserSessionPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// -------- Cookies --------
export const USER_COOKIE = USER_COOKIE_NAME

export function buildUserCookieHeader(token: string): string {
  const parts = [
    `${USER_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${USER_TOKEN_TTL}`,
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function buildClearUserCookieHeader(): string {
  return `${USER_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
}

export function readUserTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    }),
  )
  return cookies[USER_COOKIE_NAME] || null
}

export function getUserFromRequest(req: Request): UserSessionPayload | null {
  return verifyUserToken(readUserTokenFromRequest(req))
}

// -------- Validação de força de senha --------
export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (password.length < 6) return { ok: false, error: 'Senha deve ter ao menos 6 caracteres.' }
  if (password.length > 100) return { ok: false, error: 'Senha muito longa (máx 100).' }
  return { ok: true }
}

export function validateEmail(email: string): { ok: boolean; error?: string } {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!re.test(email)) return { ok: false, error: 'Email inválido.' }
  return { ok: true }
}

// -------- Helpers de DB --------
export async function findUserByEmailOrUsername(identifier: string) {
  return db.user.findFirst({
    where: {
      OR: [{ email: identifier.toLowerCase() }, { username: identifier }],
    },
  })
}

export async function createUser(input: {
  email: string
  username: string
  password: string
  displayName?: string
}) {
  const passwordHash = hashPassword(input.password)
  return db.user.create({
    data: {
      email: input.email.toLowerCase(),
      username: input.username,
      passwordHash,
      displayName: input.displayName || input.username,
    },
  })
}
