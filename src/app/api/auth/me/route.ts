// =====================================================================
// GET /api/auth/me
// Retorna o usuário autenticado (ou 401 se não logado).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAdminFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const admin = getAdminFromRequest(req)
  if (!admin) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 })
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: { username: admin.username, role: admin.role },
  })
}
