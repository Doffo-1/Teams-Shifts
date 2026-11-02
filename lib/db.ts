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
    const teamInfo = (await prisma.$queryRawUnsafe(`PRAGMA table_info("Team")`)) as any[];
    if (teamInfo && !teamInfo.some(col => col.name === 'groups')) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Team" ADD COLUMN "groups" TEXT DEFAULT '[{"id":"DEFAULT","name":"Team Members"}]'`
      );
    }
  } catch (error) {
    // Database table not created yet or already exists
  }

  try {
    const empInfo = (await prisma.$queryRawUnsafe(`PRAGMA table_info("Employee")`)) as any[];
    if (empInfo) {
      if (!empInfo.some(col => col.name === 'fixedDaySchedule')) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Employee" ADD COLUMN "fixedDaySchedule" TEXT DEFAULT '{}'`
        );
      }
      if (!empInfo.some(col => col.name === 'breakMinutes')) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Employee" ADD COLUMN "breakMinutes" INTEGER`
        );
      }
    }
  } catch (error) {
    // Database table not created yet or already exists
  }
}
