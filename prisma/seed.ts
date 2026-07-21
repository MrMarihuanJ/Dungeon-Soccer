// =====================================================================
// Script de Seed - Popula o banco com jogadores
// --------------------------------------------------------------------
// Uso: bun run db:seed
// =====================================================================

import { PrismaClient } from '@prisma/client'
import { PLAYERS_SEED } from '../src/lib/football/players-data'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  // Limpa jogadores existentes (cuidado em produção!)
  await prisma.player.deleteMany({})
  console.log('🧹 Tabela de jogadores limpa.')

  // Insere jogadores
  for (const p of PLAYERS_SEED) {
    await prisma.player.create({
      data: {
        name: p.name,
        fullName: p.fullName,
        position: p.position,
        team: p.team,
        photoUrl: p.photoUrl,
        nationality: p.nationality,
        shirtNumber: p.shirtNumber ?? null,
      },
    })
  }

  const total = await prisma.player.count()
  console.log(`✅ Seed concluído! ${total} jogadores inseridos.`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
