import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const currentGw =
      (await prisma.gameweek.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      })) ??
      (await prisma.gameweek.findFirst({
        orderBy: { id: "asc" },
        select: { id: true },
      }));

    return NextResponse.json(
      {
        status: "ok",
        service: "kpl-fantasy",
        database: "connected",
        activeGameweek: currentGw?.id ?? null,
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch {
    // Never leak connection strings, hostnames, or credentials in health output
    return NextResponse.json(
      {
        status: "degraded",
        service: "kpl-fantasy",
        database: "disconnected",
        activeGameweek: null,
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
