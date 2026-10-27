import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUser } from "../../../lib/session";
import {
  ChipType,
  GameweekHistoryRow,
  GameweekPointsPlayer,
  PointsApiData,
  Position,
} from "../../../lib/types";

const QuerySchema = z.object({
  gameweek: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/points?gameweek=N
 * Returns the authenticated manager's immutable SquadSnapshot for a processed
 * gameweek (defaults to the most recent one), the per-player breakdown, and
 * the full gameweek-by-gameweek history for the season.
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
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const squad = await prisma.squad.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        totalPoints: true,
        snapshots: {
          where: { players: { some: {} } },
          orderBy: { gameweekId: "asc" },
          select: { id: true, gameweekId: true, totalPoints: true, rank: true, chipPlayed: true },
        },
      },
    });

    if (!squad) {
      const empty: PointsApiData = {
        hasSquad: false,
        squadName: null,
        seasonTotalPoints: 0,
        selectedGameweekId: null,
        history: [],
        snapshot: null,
      };
      return NextResponse.json({ success: true, data: empty });
    }

    const history: GameweekHistoryRow[] = squad.snapshots.map((s) => ({
      gameweekId: s.gameweekId,
      totalPoints: s.totalPoints,
      rank: s.rank,
      chipPlayed: (s.chipPlayed as ChipType | null) ?? null,
    }));

    const targetGameweekId =
      parsed.data.gameweek ?? history[history.length - 1]?.gameweekId ?? null;
    const target = squad.snapshots.find((s) => s.gameweekId === targetGameweekId);

    let snapshot: PointsApiData["snapshot"] = null;

    if (target) {
      const [snapshotPlayers, gwAggregate] = await Promise.all([
        prisma.squadSnapshotPlayer.findMany({
          where: { snapshotId: target.id },
          orderBy: { positionOrder: "asc" },
          include: {
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                position: true,
                club: { select: { id: true, name: true, shortName: true, logoUrl: true } },
                performances: {
                  where: { gameweekId: target.gameweekId },
                  select: { minutes: true, totalPoints: true },
                },
              },
            },
          },
        }),
        prisma.squadSnapshot.aggregate({
          where: { gameweekId: target.gameweekId },
          _avg: { totalPoints: true },
          _max: { totalPoints: true },
        }),
      ]);

      const players: GameweekPointsPlayer[] = snapshotPlayers.map((sp) => {
        const perf = sp.player.performances[0];
        return {
          playerId: sp.playerId,
          firstName: sp.player.firstName,
          lastName: sp.player.lastName,
          position: sp.player.position as Position,
          club: sp.player.club,
          positionOrder: sp.positionOrder,
          isCaptain: sp.isCaptain,
          isViceCaptain: sp.isViceCaptain,
          multiplier: sp.multiplier,
          basePoints: perf?.totalPoints ?? 0,
          points: sp.points,
          minutes: perf?.minutes ?? 0,
        };
      });

      snapshot = {
        gameweekId: target.gameweekId,
        totalPoints: target.totalPoints,
        rank: target.rank,
        chipPlayed: (target.chipPlayed as ChipType | null) ?? null,
        gameweekAverage: Math.round(gwAggregate._avg.totalPoints ?? 0),
        gameweekHighest: gwAggregate._max.totalPoints ?? 0,
        players,
      };
    }

    const data: PointsApiData = {
      hasSquad: true,
      squadName: squad.name,
      seasonTotalPoints: squad.totalPoints,
      selectedGameweekId: target?.gameweekId ?? null,
      history,
      snapshot,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("GET /api/points error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch gameweek points." },
      { status: 500 }
    );
  }
}

