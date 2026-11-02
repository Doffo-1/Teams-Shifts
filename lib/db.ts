import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let isInitialized = false;

export async function ensureDefaultData() {
  if (isInitialized) return;

  try {
    // Ensure groups column exists on Team table and is populated
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Team" ADD COLUMN "groups" TEXT DEFAULT '[{"id":"DEFAULT","name":"Team Members"},{"id":"NIET_IN_DE_LIJN","name":"Niet in de lijn"}]'`
      );
    } catch {
      // Column already exists
    }

    try {
      const allTeams = await prisma.$queryRawUnsafe<any[]>(`SELECT id, "groups" FROM "Team"`);
      for (const t of allTeams) {
        if (!t.groups || t.groups === '[]' || t.groups === 'null') {
          await prisma.$executeRawUnsafe(
            `UPDATE "Team" SET "groups" = ? WHERE id = ?`,
            JSON.stringify([
              { id: 'DEFAULT', name: 'Team Members' },
              { id: 'NIET_IN_DE_LIJN', name: 'Niet in de lijn' },
            ]),
            t.id
          );
        }
      }
    } catch (e) {
      console.error('Error migrating team groups:', e);
    }

    isInitialized = true;
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}
