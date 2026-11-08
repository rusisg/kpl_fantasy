import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export const PG_POOL_CONFIG = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
} as const;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaSignature: string | undefined;
  pgPool: pg.Pool | undefined;
};

/**
 * Signature of the currently generated client's models/fields.
 * In dev, the client is cached on `globalThis` to survive hot reloads. After
 * `prisma generate` (e.g. a new column), that cached instance would still use
 * the OLD schema ("Unknown argument `telegramId`"). Comparing signatures lets us
 * drop the stale instance and create a fresh client automatically.
 */
const schemaSignature = [
  Object.keys(Prisma.ModelName).join(","),
  Object.keys(Prisma.UserScalarFieldEnum).join(","),
].join("|");

const connectionString =
  process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? undefined;

const pool =
  globalForPrisma.pgPool ??
  new pg.Pool({
    connectionString,
    max: PG_POOL_CONFIG.max,
    idleTimeoutMillis: PG_POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: PG_POOL_CONFIG.connectionTimeoutMillis,
  });

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

const cachedIsFresh =
  globalForPrisma.prisma &&
  globalForPrisma.prismaSchemaSignature === schemaSignature;

if (globalForPrisma.prisma && !cachedIsFresh) {
  // Stale client from before the last `prisma generate`; release it.
  void globalForPrisma.prisma.$disconnect().catch(() => {});
}

export const prisma: PrismaClient = cachedIsFresh
  ? globalForPrisma.prisma!
  : createClient();

// Cache singleton pool & client across dev hot-reloads and warm serverless invocations
globalForPrisma.prisma = prisma;
globalForPrisma.prismaSchemaSignature = schemaSignature;
globalForPrisma.pgPool = pool;

