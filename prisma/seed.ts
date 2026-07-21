// =====================================================================
// Script de Seed - Popula o banco com jogadores + ratings
// Uso: bun run db:seed
// =====================================================================

import { PrismaClient } from '@prisma/client'
import { PLAYERS_SEED } from '../src/lib/football/players-data'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  await prisma.player.deleteMany({})
  console.log('🧹 Tabela de jogadores limpa.')

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
        overall: p.overall,
        age: p.age,
        pace: p.pace ?? 70,
        shooting: p.shooting ?? 70,
        passing: p.passing ?? 70,
        dribbling: p.dribbling ?? 70,
        defending: p.defending ?? 70,
        physical: p.physical ?? 70,
        leagueTier: p.leagueTier ?? 'OTHER',
        isRetired: p.isRetired ?? false,
        isInactive: p.isInactive ?? false,
      },
    })
  }

  const total = await prisma.player.count()
  const retired = await prisma.player.count({ where: { isRetired: true } })
  console.log(`✅ Seed concluído! ${total} jogadores inseridos (${retired} lendas aposentados).`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
