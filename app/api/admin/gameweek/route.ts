import { NextResponse } from "next/server";
import { FixtureStatus } from "@prisma/client";
import { z } from "zod";
import { verifyAdminRequest } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { calculatePlayerMatchPoints } from "../../../../lib/scoring-engine";
import { Position } from "../../../../lib/types";

const POSITION_SORT_ORDER: Record<string, number> = {
  GK: 0,
  DEF: 1,
  MID: 2,
  FWD: 3,
};

export async function GET(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { error: "Forbidden: Admin authentication required." },
      { status: 403 }
    );
  }

  try {
    const url = new URL(request.url);
    const gwParam = url.searchParams.get("gameweekId");
    const requestedGwId = gwParam ? Number.parseInt(gwParam, 10) : null;

    const allGameweeks = await prisma.gameweek.findMany({
      orderBy: { id: "asc" },
      include: {
        _count: {
          select: {
            fixtures: true,
            performances: true,
            snapshots: true,
          },
        },
      },
    });

    if (allGameweeks.length === 0) {
      return NextResponse.json({
        gameweeks: [],
        selectedGameweek: null,
        fixtures: [],
        summary: {
          totalSquads: 0,
          performancesRecorded: 0,
          snapshotsCount: 0,
        },
      });
    }

    const selectedGw =
      (requestedGwId
        ? allGameweeks.find((g) => g.id === requestedGwId)
        : null) ??
      allGameweeks.find((g) => g.isCurrent) ??
      allGameweeks.find((g) => !g.isFinished) ??
      allGameweeks[allGameweeks.length - 1];

    const nowMs = Date.now();

    const [fixtures, totalSquads] = await Promise.all([
      prisma.fixture.findMany({
        where: { gameweekId: selectedGw.id },
        orderBy: [{ kickoffTime: "asc" }, { id: "asc" }],
        include: {
          homeClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
          awayClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
        },
      }),
      prisma.squad.count(),
    ]);

    const clubIds = Array.from(
      new Set(fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]))
    );

    const [players, performances] = await Promise.all([
      clubIds.length > 0
        ? prisma.player.findMany({
            where: { clubId: { in: clubIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              clubId: true,
              position: true,
              price: true,
              totalPoints: true,
            },
          })
        : Promise.resolve([]),
      prisma.playerPerformance.findMany({
        where: { gameweekId: selectedGw.id },
      }),
    ]);

    const perfByPlayerId = new Map(
      performances.map((p) => [p.playerId, p])
    );

    const playersByClubId = new Map<
      string,
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        clubId: string;
        position: string;
        price: number;
        seasonPoints: number;
        performance: {
          minutes: number;
          goalsScored: number;
          assists: number;
          cleanSheets: number;
          goalsConceded: number;
          saves: number;
          penaltiesSaved: number;
          penaltiesMissed: number;
          yellowCards: number;
          redCards: number;
          ownGoals: number;
          bonusPoints: number;
          totalPoints: number;
        } | null;
      }>
    >();

    for (const p of players) {
      const perf = perfByPlayerId.get(p.id);
      const list = playersByClubId.get(p.clubId) ?? [];
      list.push({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        clubId: p.clubId,
        position: p.position,
        price: Number(p.price),
        seasonPoints: p.totalPoints,
        performance: perf
          ? {
              minutes: perf.minutes,
              goalsScored: perf.goalsScored,
              assists: perf.assists,
              cleanSheets: perf.cleanSheets,
              goalsConceded: perf.goalsConceded,
              saves: perf.saves,
              penaltiesSaved: perf.penaltiesSaved,
              penaltiesMissed: perf.penaltiesMissed,
              yellowCards: perf.yellowCards,
              redCards: perf.redCards,
              ownGoals: perf.ownGoals,
              bonusPoints: perf.bonusPoints,
              totalPoints: perf.totalPoints,
            }
          : null,
      });
      playersByClubId.set(p.clubId, list);
    }

    for (const list of playersByClubId.values()) {
      list.sort(
        (a, b) =>
          (POSITION_SORT_ORDER[a.position] ?? 9) -
            (POSITION_SORT_ORDER[b.position] ?? 9) ||
          b.price - a.price ||
          a.lastName.localeCompare(b.lastName)
      );
    }

    const serializedFixtures = fixtures.map((f) => ({
      id: f.id,
      gameweekId: f.gameweekId,
      kickoffTime: f.kickoffTime.toISOString(),
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      status: f.status,
      homeClub: f.homeClub,
      awayClub: f.awayClub,
      homePlayers: playersByClubId.get(f.homeClubId) ?? [],
      awayPlayers: playersByClubId.get(f.awayClubId) ?? [],
    }));

    return NextResponse.json({
      gameweeks: allGameweeks.map((g) => ({
        id: g.id,
        deadline: g.deadline.toISOString(),
        isCurrent: g.isCurrent,
        isFinished: g.isFinished,
        isLocked: g.isFinished || g.deadline.getTime() <= nowMs,
        fixtureCount: g._count.fixtures,
        performancesCount: g._count.performances,
        snapshotsCount: g._count.snapshots,
      })),
      selectedGameweek: {
        id: selectedGw.id,
        deadline: selectedGw.deadline.toISOString(),
        isCurrent: selectedGw.isCurrent,
        isFinished: selectedGw.isFinished,
        isLocked:
          selectedGw.isFinished || selectedGw.deadline.getTime() <= nowMs,
      },
      fixtures: serializedFixtures,
      summary: {
        totalSquads,
        performancesRecorded: performances.length,
        snapshotsCount: selectedGw._count.snapshots,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/gameweek error:", error);
    return NextResponse.json(
      { error: "Failed to load admin gameweek data." },
      { status: 500 }
    );
  }
}

const AdminGameweekActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("LOCK_NOW"),
    gameweekId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("UNLOCK"),
    gameweekId: z.number().int().positive(),
    deadline: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("ADVANCE_GAMEWEEK"),
    gameweekId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("SET_CURRENT"),
    gameweekId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("SAVE_MATCHDAY"),
    gameweekId: z.number().int().positive(),
    fixtures: z
      .array(
        z.object({
          fixtureId: z.string().trim().min(1),
          homeScore: z.number().int().min(0).max(30).nullable().optional(),
          awayScore: z.number().int().min(0).max(30).nullable().optional(),
          status: z
            .enum(["SCHEDULED", "LIVE", "FINISHED", "POSTPONED", "CANCELLED"])
            .optional(),
        })
      )
      .optional(),
    performances: z
      .array(
        z.object({
          playerId: z.string().trim().min(1),
          fixtureId: z.string().trim().min(1),
          minutes: z.number().int().min(0).max(130),
          goalsScored: z.number().int().min(0).default(0),
          assists: z.number().int().min(0).default(0),
          cleanSheets: z.number().int().min(0).max(1).optional(),
          goalsConceded: z.number().int().min(0).default(0),
          saves: z.number().int().min(0).default(0),
          penaltiesSaved: z.number().int().min(0).default(0),
          penaltiesMissed: z.number().int().min(0).default(0),
          yellowCards: z.number().int().min(0).default(0),
          redCards: z.number().int().min(0).default(0),
          ownGoals: z.number().int().min(0).default(0),
          bonusPoints: z.number().int().default(0),
        })
      )
      .optional(),
  }),
]);

export async function POST(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { error: "Forbidden: Admin authentication required." },
      { status: 403 }
    );
  }

  try {
    const raw = await request.json();
    const parsed = AdminGameweekActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid admin action payload.",
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.action === "LOCK_NOW") {
      const pastDeadline = new Date(Date.now() - 60_000);
      const updated = await prisma.gameweek.update({
        where: { id: data.gameweekId },
        data: { deadline: pastDeadline },
      });
      return NextResponse.json({
        success: true,
        gameweek: {
          id: updated.id,
          deadline: updated.deadline.toISOString(),
          isCurrent: updated.isCurrent,
          isFinished: updated.isFinished,
          isLocked: true,
        },
      });
    }

    if (data.action === "UNLOCK") {
      const futureDeadline = data.deadline
        ? new Date(data.deadline)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const updated = await prisma.gameweek.update({
        where: { id: data.gameweekId },
        data: {
          deadline: futureDeadline,
          isFinished: false,
        },
      });
      return NextResponse.json({
        success: true,
        gameweek: {
          id: updated.id,
          deadline: updated.deadline.toISOString(),
          isCurrent: updated.isCurrent,
          isFinished: updated.isFinished,
          isLocked: false,
        },
      });
    }

    if (data.action === "SET_CURRENT") {
      await prisma.$transaction([
        prisma.gameweek.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        }),
        prisma.gameweek.update({
          where: { id: data.gameweekId },
          data: { isCurrent: true },
        }),
      ]);
      return NextResponse.json({
        success: true,
        activeGameweekId: data.gameweekId,
      });
    }

    if (data.action === "ADVANCE_GAMEWEEK") {
      const nextGw = await prisma.$transaction(async (tx) => {
        await tx.gameweek.update({
          where: { id: data.gameweekId },
          data: { isCurrent: false, isFinished: true },
        });

        const candidate =
          (await tx.gameweek.findFirst({
            where: { id: { gt: data.gameweekId } },
            orderBy: { id: "asc" },
          })) ??
          (await tx.gameweek.findFirst({
            where: { isFinished: false },
            orderBy: { id: "asc" },
          }));

        if (candidate) {
          await tx.gameweek.updateMany({
            where: { isCurrent: true },
            data: { isCurrent: false },
          });
          return tx.gameweek.update({
            where: { id: candidate.id },
            data: { isCurrent: true },
          });
        }
        return null;
      });

      return NextResponse.json({
        success: true,
        nextGameweekId: nextGw?.id ?? data.gameweekId,
      });
    }

    if (data.action === "SAVE_MATCHDAY") {
      const savedCounts = await prisma.$transaction(async (tx) => {
        let fixturesUpdated = 0;
        let performancesUpserted = 0;

        if (data.fixtures && data.fixtures.length > 0) {
          for (const fix of data.fixtures) {
            const hasScores =
              fix.homeScore !== undefined &&
              fix.homeScore !== null &&
              fix.awayScore !== undefined &&
              fix.awayScore !== null;
            const nextStatus: FixtureStatus | undefined = fix.status
              ? (fix.status as FixtureStatus)
              : hasScores
                ? FixtureStatus.FINISHED
                : undefined;

            await tx.fixture.updateMany({
              where: { id: fix.fixtureId, gameweekId: data.gameweekId },
              data: {
                ...(fix.homeScore !== undefined
                  ? { homeScore: fix.homeScore }
                  : {}),
                ...(fix.awayScore !== undefined
                  ? { awayScore: fix.awayScore }
                  : {}),
                ...(nextStatus ? { status: nextStatus } : {}),
              },
            });
            fixturesUpdated++;
          }
        }

        if (data.performances && data.performances.length > 0) {
          const playerIds = data.performances.map((p) => p.playerId);
          const players = await tx.player.findMany({
            where: { id: { in: playerIds } },
            select: { id: true, position: true },
          });
          const posByPlayer = new Map(
            players.map((p) => [p.id, p.position as Position])
          );

          for (const stat of data.performances) {
            const position = posByPlayer.get(stat.playerId);
            if (!position) continue;

            const resolvedCleanSheets =
              stat.cleanSheets !== undefined
                ? stat.cleanSheets
                : stat.minutes >= 60 && stat.goalsConceded === 0
                  ? 1
                  : 0;

            const computedPoints = calculatePlayerMatchPoints({
              position,
              minutes: stat.minutes,
              goalsScored: stat.goalsScored,
              assists: stat.assists,
              cleanSheets: resolvedCleanSheets,
              goalsConceded: stat.goalsConceded,
              saves: stat.saves,
              penaltiesSaved: stat.penaltiesSaved,
              penaltiesMissed: stat.penaltiesMissed,
              yellowCards: stat.yellowCards,
              redCards: stat.redCards,
              ownGoals: stat.ownGoals,
              bonusPoints: stat.bonusPoints,
            });

            await tx.playerPerformance.upsert({
              where: {
                playerId_gameweekId: {
                  playerId: stat.playerId,
                  gameweekId: data.gameweekId,
                },
              },
              create: {
                playerId: stat.playerId,
                gameweekId: data.gameweekId,
                fixtureId: stat.fixtureId,
                minutes: stat.minutes,
                goalsScored: stat.goalsScored,
                assists: stat.assists,
                cleanSheets: resolvedCleanSheets,
                goalsConceded: stat.goalsConceded,
                saves: stat.saves,
                penaltiesSaved: stat.penaltiesSaved,
                penaltiesMissed: stat.penaltiesMissed,
                yellowCards: stat.yellowCards,
                redCards: stat.redCards,
                ownGoals: stat.ownGoals,
                bonusPoints: stat.bonusPoints,
                totalPoints: computedPoints,
              },
              update: {
                fixtureId: stat.fixtureId,
                minutes: stat.minutes,
                goalsScored: stat.goalsScored,
                assists: stat.assists,
                cleanSheets: resolvedCleanSheets,
                goalsConceded: stat.goalsConceded,
                saves: stat.saves,
                penaltiesSaved: stat.penaltiesSaved,
                penaltiesMissed: stat.penaltiesMissed,
                yellowCards: stat.yellowCards,
                redCards: stat.redCards,
                ownGoals: stat.ownGoals,
                bonusPoints: stat.bonusPoints,
                totalPoints: computedPoints,
              },
            });
            performancesUpserted++;
          }
        }

        return { fixturesUpdated, performancesUpserted };
      });

      return NextResponse.json({
        success: true,
        ...savedCounts,
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/admin/gameweek error:", error);
    return NextResponse.json(
      { error: "Failed to execute admin gameweek action." },
      { status: 500 }
    );
  }
}
