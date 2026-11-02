import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let isInitialized = false;

export async function ensureDefaultData() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const tableInfo = (await prisma.$queryRawUnsafe(`PRAGMA table_info("Team")`)) as any[];
    const hasGroups = tableInfo.some(col => col.name === 'groups');
    if (!hasGroups) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Team" ADD COLUMN "groups" TEXT DEFAULT '[{"id":"DEFAULT","name":"Team Members"},{"id":"NIET_IN_DE_LIJN","name":"Niet in de lijn"}]'`
      );
    }
  } catch (error) {
    // Database table not created yet or already exists
  }
}
