import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUser } from "../../../lib/session";
import {
  serializeGameweekPointsLineup,
  SerializableLineupPlayerInput,
  SerializablePlayerPerformanceInput,
} from "../../../lib/scoring-engine";
import {
  ChipType,
  FixtureStatus,
  GameweekHistoryRow,
  PlayerMatchFixtureSummary,
  PointsApiData,
  Position,
} from "../../../lib/types";

const QuerySchema = z.object({
  gameweekId: z.coerce.number().int().positive().optional(),
  gameweek: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/points?gameweekId=X (or ?gameweek=X)
 * Authenticates the current manager via session and returns:
 * - Squad Gameweek total score and active chip (if played)
 * - Full 15-player lineup with individual match stat breakdowns & point sources
 * - Multiplier indicators (2x Captain, 3x Triple Captain, Vice-Captain failover)
 * - Auto-substitution status (subbedIn / subbedOut with reason and partner)
 * - Gameweek summary benchmarks: GW Points, Average Score, Highest Score, GW Rank
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    gameweekId: searchParams.get("gameweekId") ?? undefined,
    gameweek: searchParams.get("gameweek") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid gameweekId parameter." },
      { status: 400 }
    );
  }

  try {
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const [allGameweeks, squad] = await Promise.all([
      prisma.gameweek.findMany({
        orderBy: { id: "asc" },
        select: { id: true, isCurrent: true, isFinished: true },
      }),
      prisma.squad.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          name: true,
          totalPoints: true,
          players: {
            orderBy: { positionOrder: "asc" },
            include: {
              player: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  position: true,
                  clubId: true,
                  club: {
                    select: {
                      id: true,
                      name: true,
                      shortName: true,
                      logoUrl: true,
                    },
                  },
                },
              },
            },
          },
          snapshots: {
            orderBy: { gameweekId: "asc" },
            select: {
              id: true,
              gameweekId: true,
              totalPoints: true,
              rank: true,
              chipPlayed: true,
              _count: { select: { players: true } },
            },
          },
        },
      }),
    ]);

    const availableGameweekIds = allGameweeks.map((gw) => gw.id);
    const activeGw =
      allGameweeks.find((gw) => gw.isCurrent) ??
      allGameweeks.filter((gw) => gw.isFinished).slice(-1)[0] ??
      allGameweeks[0] ??
      null;

    if (!squad || squad.players.length === 0) {
      const empty: PointsApiData = {
        hasSquad: false,
        squadName: squad?.name ?? null,
        seasonTotalPoints: squad?.totalPoints ?? 0,
        selectedGameweekId: null,
        activeGameweekId: activeGw?.id ?? null,
        availableGameweekIds,
        history: [],
        snapshot: null,
      };
      return NextResponse.json({ success: true, data: empty });
    }

    const populatedSnapshots = squad.snapshots.filter(
      (s) => s._count.players > 0
    );

    const history: GameweekHistoryRow[] = populatedSnapshots.map((s) => ({
      gameweekId: s.gameweekId,
      totalPoints: s.totalPoints,
      rank: s.rank,
      chipPlayed: (s.chipPlayed as ChipType | null) ?? null,
    }));

    const requestedGwId = parsed.data.gameweekId ?? parsed.data.gameweek;

    let targetGameweekId: number | null = requestedGwId ?? null;
    if (!targetGameweekId) {
      // Default to latest scored snapshot gameweek if available, or active gameweek
      const latestScoredSnapshotGw =
        populatedSnapshots[populatedSnapshots.length - 1]?.gameweekId ?? null;

      if (activeGw) {
        const activePerfCount = await prisma.playerPerformance.count({
          where: { gameweekId: activeGw.id },
        });
        if (activePerfCount > 0) {
          targetGameweekId = activeGw.id;
        } else {
          targetGameweekId = latestScoredSnapshotGw ?? activeGw.id;
        }
      } else {
        targetGameweekId = latestScoredSnapshotGw;
      }
    }

    let snapshot: PointsApiData["snapshot"] = null;

    if (targetGameweekId !== null) {
      const existingSnapMeta = squad.snapshots.find(
        (s) => s.gameweekId === targetGameweekId
      );
      const hasSnapshotPlayers = Boolean(
        existingSnapMeta && existingSnapMeta._count.players > 0
      );

      // Load fixtures for this gameweek so every player gets their club's match result
      const gwFixtures = await prisma.fixture.findMany({
        where: { gameweekId: targetGameweekId },
        include: {
          homeClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
          awayClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
        },
      });

      const fixtureByClubId = new Map<string, PlayerMatchFixtureSummary>();
      for (const fx of gwFixtures) {
        fixtureByClubId.set(fx.homeClubId, {
          fixtureId: fx.id,
          homeClub: fx.homeClub,
          awayClub: fx.awayClub,
          homeScore: fx.homeScore,
          awayScore: fx.awayScore,
          isHome: true,
          status: fx.status as FixtureStatus,
        });
        fixtureByClubId.set(fx.awayClubId, {
          fixtureId: fx.id,
          homeClub: fx.homeClub,
          awayClub: fx.awayClub,
          homeScore: fx.homeScore,
          awayScore: fx.awayScore,
          isHome: false,
          status: fx.status as FixtureStatus,
        });
      }

      let lineupInput: SerializableLineupPlayerInput[] = [];
      let playerIds: string[] = [];

      if (hasSnapshotPlayers && existingSnapMeta) {
        const snapshotPlayers = await prisma.squadSnapshotPlayer.findMany({
          where: { snapshotId: existingSnapMeta.id },
          orderBy: { positionOrder: "asc" },
          include: {
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                position: true,
                clubId: true,
                club: {
                  select: {
                    id: true,
                    name: true,
                    shortName: true,
                    logoUrl: true,
                  },
                },
              },
            },
          },
        });

        lineupInput = snapshotPlayers.map((sp) => ({
          playerId: sp.playerId,
          firstName: sp.player.firstName,
          lastName: sp.player.lastName,
          position: sp.player.position as Position,
          club: sp.player.club,
          positionOrder: sp.positionOrder,
          isCaptain: sp.isCaptain,
          isViceCaptain: sp.isViceCaptain,
        }));
        playerIds = snapshotPlayers.map((sp) => sp.playerId);
      } else {
        // Live squad evaluation for an ongoing or not-yet-snapshotted gameweek
        lineupInput = squad.players.map((sp) => ({
          playerId: sp.playerId,
          firstName: sp.player.firstName,
          lastName: sp.player.lastName,
          position: sp.player.position as Position,
          club: sp.player.club,
          positionOrder: sp.positionOrder,
          isCaptain: sp.isCaptain,
          isViceCaptain: sp.isViceCaptain,
        }));
        playerIds = squad.players.map((sp) => sp.playerId);
      }

      const [performances, gwAggregate, totalSnapshotsForGw] =
        await Promise.all([
          prisma.playerPerformance.findMany({
            where: {
              gameweekId: targetGameweekId,
              playerId: { in: playerIds },
            },
          }),
          prisma.squadSnapshot.aggregate({
            where: {
              gameweekId: targetGameweekId,
              players: { some: {} },
            },
            _avg: { totalPoints: true },
            _max: { totalPoints: true },
          }),
          prisma.squadSnapshot.count({
            where: {
              gameweekId: targetGameweekId,
              players: { some: {} },
            },
          }),
        ]);

      const perfByPlayerId = new Map<string, SerializablePlayerPerformanceInput>();

      for (const member of lineupInput) {
        const perf = performances.find((p) => p.playerId === member.playerId);
        const clubFixture = fixtureByClubId.get(member.club.id) ?? null;

        perfByPlayerId.set(member.playerId, {
          minutes: perf?.minutes ?? 0,
          goalsScored: perf?.goalsScored ?? 0,
          assists: perf?.assists ?? 0,
          cleanSheets: perf?.cleanSheets,
          goalsConceded: perf?.goalsConceded ?? 0,
          saves: perf?.saves ?? 0,
          penaltiesSaved: perf?.penaltiesSaved ?? 0,
          penaltiesMissed: perf?.penaltiesMissed ?? 0,
          yellowCards: perf?.yellowCards ?? 0,
          redCards: perf?.redCards ?? 0,
          ownGoals: perf?.ownGoals ?? 0,
          bonusPoints: perf?.bonusPoints ?? 0,
          totalPoints: perf?.totalPoints,
          fixture: clubFixture,
        });
      }

      const chipPlayed =
        (existingSnapMeta?.chipPlayed as ChipType | null) ?? null;

      const serialized = serializeGameweekPointsLineup(
        lineupInput,
        perfByPlayerId,
        chipPlayed
      );

      const effectiveTotalPoints = hasSnapshotPlayers && existingSnapMeta
        ? existingSnapMeta.totalPoints
        : serialized.totalPoints;

      const gameweekAverage =
        totalSnapshotsForGw > 0
          ? Math.round(gwAggregate._avg.totalPoints ?? 0)
          : effectiveTotalPoints;
      const gameweekHighest =
        totalSnapshotsForGw > 0
          ? Math.max(gwAggregate._max.totalPoints ?? 0, effectiveTotalPoints)
          : effectiveTotalPoints;
      const rank =
        hasSnapshotPlayers && existingSnapMeta?.rank
          ? existingSnapMeta.rank
          : totalSnapshotsForGw > 0
            ? null
            : 1;

      snapshot = {
        gameweekId: targetGameweekId,
        totalPoints: effectiveTotalPoints,
        rank,
        chipPlayed,
        gameweekAverage,
        gameweekHighest,
        isLive: !hasSnapshotPlayers,
        players: serialized.players,
      };
    }

    const data: PointsApiData = {
      hasSquad: true,
      squadName: squad.name,
      seasonTotalPoints: squad.totalPoints,
      selectedGameweekId: snapshot?.gameweekId ?? targetGameweekId,
      activeGameweekId: activeGw?.id ?? null,
      availableGameweekIds,
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
