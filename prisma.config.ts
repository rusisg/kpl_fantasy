import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 datasource configuration:
 * - Uses `DIRECT_URL` when provided (recommended for migrations/DDL alongside
 *   serverless connection poolers such as PgBouncer, Supabase Supavisor, or Neon).
 * - Falls back to `DATABASE_URL` (pooled runtime connection string) or a safe
 *   build-time placeholder so `prisma generate` succeeds inside isolated Docker builds.
 */
const datasourceUrl =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@localhost:5432/kpl_fantasy?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: datasourceUrl,
  },
});
