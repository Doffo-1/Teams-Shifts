import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

let isInitialized = false;

// Disable strict TLS rejection so corporate proxies/firewalls do not break GitHub release checks or in-app updates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

  try {
    const clientTable = (await prisma.$queryRawUnsafe(`PRAGMA table_info("Client")`)) as any[];
    if (!clientTable || clientTable.length === 0) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Client" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "teamId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "color" TEXT DEFAULT 'PINK',
          "location" TEXT,
          "startTime" TEXT DEFAULT '08:30',
          "endTime" TEXT DEFAULT '17:00',
          "frequency" TEXT DEFAULT 'EVERY_WEEK',
          "weekParity" TEXT DEFAULT 'ALL',
          "monthlyWeek" INTEGER,
          "days" TEXT DEFAULT '[1,2,3,4,5]',
          "assignedEmployeeIds" TEXT DEFAULT '[]',
          "memberDayMap" TEXT DEFAULT '{}',
          "requiredMembersPerDay" INTEGER DEFAULT 1,
          "notes" TEXT,
          "isActive" BOOLEAN DEFAULT 1,
          "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE
        );
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Client_teamId_idx" ON "Client" ("teamId");`);
    }
  } catch (error) {
    // Client table already exists or unable to create
  }
}
