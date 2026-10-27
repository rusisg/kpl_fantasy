import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { FixtureItem, FixturesApiData } from "../../../lib/types";

const QuerySchema = z.object({
  gameweek: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/fixtures?gameweek=N
 * Returns all fixtures for the requested gameweek (defaults to the active gameweek)
 * plus navigation metadata (first/last gameweek ids) for the fixtures browser.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    gameweek: searchParams.get("gameweek") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid gameweek parameter." },
      { status: 400 }
    );
  }

  try {
    const [bounds, activeGameweek] = await Promise.all([
      prisma.gameweek.aggregate({ _min: { id: true }, _max: { id: true } }),
      prisma.gameweek.findFirst({
        where: { OR: [{ isCurrent: true }, { isFinished: false }] },
        orderBy: [{ isCurrent: "desc" }, { id: "asc" }],
      }),
    ]);

    const firstGameweekId = bounds._min.id;
    const lastGameweekId = bounds._max.id;

    if (firstGameweekId === null || lastGameweekId === null) {
      return NextResponse.json({ success: true, data: null });
    }

    const requestedId = parsed.data.gameweek ?? activeGameweek?.id ?? firstGameweekId;

    const gameweek = await prisma.gameweek.findUnique({
      where: { id: requestedId },
      include: {
        fixtures: {
          orderBy: { kickoffTime: "asc" },
          include: {
            homeClub: { select: { id: true, name: true, shortName: true, logoUrl: true } },
            awayClub: { select: { id: true, name: true, shortName: true, logoUrl: true } },
          },
        },
      },
    });

    if (!gameweek) {
      return NextResponse.json(
        { success: false, error: `Gameweek ${requestedId} not found.` },
        { status: 404 }
      );
    }

    const fixtures: FixtureItem[] = gameweek.fixtures.map((f) => ({
      id: f.id,
      kickoffTime: f.kickoffTime.toISOString(),
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      homeClub: f.homeClub,
      awayClub: f.awayClub,
    }));

    const data: FixturesApiData = {
      gameweek: {
        id: gameweek.id,
        deadline: gameweek.deadline.toISOString(),
        isCurrent: gameweek.isCurrent,
        isFinished: gameweek.isFinished,
        isLocked: gameweek.isFinished || gameweek.deadline.getTime() <= Date.now(),
      },
      activeGameweekId: activeGameweek?.id ?? null,
      firstGameweekId,
      lastGameweekId,
      fixtures,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/fixtures error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch fixtures." },
      { status: 500 }
    );
  }
}

