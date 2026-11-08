import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminRequest } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import {
  calculatePlayerMatchPoints,
  calculateSquadGameweekScore,
} from "../../../../lib/scoring-engine";
import { Position } from "../../../../lib/types";

const PreviewPerformanceSchema = z.object({
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
});

const PreviewRequestSchema = z.object({
  gameweekId: z.number().int().positive(),
  performances: z.array(PreviewPerformanceSchema).optional(),
});

export async function POST(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { error: "Forbidden: Admin authentication required." },
      { status: 403 }
    );
  }

  try {
    const raw = await request.json();
    const parsed = PreviewRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid preview request payload.",
        },
        { status: 400 }
      );
    }

    const { gameweekId, performances: incomingPerformances = [] } = parsed.data;

    // 1. Load existing DB performances for this gameweek and merge with incoming form state (dry-run in memory)
    const dbPerformances = await prisma.playerPerformance.findMany({
      where: { gameweekId },
    });

    const mergedRawStats = new Map<
      string,
      {
        playerId: string;
        fixtureId: string;
        minutes: number;
        goalsScored: number;
        assists: number;
        cleanSheets?: number;
        goalsConceded: number;
        saves: number;
        penaltiesSaved: number;
        penaltiesMissed: number;
        yellowCards: number;
        redCards: number;
        ownGoals: number;
        bonusPoints: number;
      }
    >();

    for (const dbPerf of dbPerformances) {
      mergedRawStats.set(dbPerf.playerId, {
        playerId: dbPerf.playerId,
        fixtureId: dbPerf.fixtureId,
        minutes: dbPerf.minutes,
        goalsScored: dbPerf.goalsScored,
        assists: dbPerf.assists,
        cleanSheets: dbPerf.cleanSheets,
        goalsConceded: dbPerf.goalsConceded,
        saves: dbPerf.saves,
        penaltiesSaved: dbPerf.penaltiesSaved,
        penaltiesMissed: dbPerf.penaltiesMissed,
        yellowCards: dbPerf.yellowCards,
        redCards: dbPerf.redCards,
        ownGoals: dbPerf.ownGoals,
        bonusPoints: dbPerf.bonusPoints,
      });
    }

    for (const inc of incomingPerformances) {
      mergedRawStats.set(inc.playerId, {
        playerId: inc.playerId,
        fixtureId: inc.fixtureId,
        minutes: inc.minutes,
        goalsScored: inc.goalsScored,
        assists: inc.assists,
        cleanSheets: inc.cleanSheets,
        goalsConceded: inc.goalsConceded,
        saves: inc.saves,
        penaltiesSaved: inc.penaltiesSaved,
        penaltiesMissed: inc.penaltiesMissed,
        yellowCards: inc.yellowCards,
        redCards: inc.redCards,
        ownGoals: inc.ownGoals,
        bonusPoints: inc.bonusPoints,
      });
    }

    const allPlayerIds = Array.from(mergedRawStats.keys());
    const playerRecords =
      allPlayerIds.length > 0
        ? await prisma.player.findMany({
            where: { id: { in: allPlayerIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              position: true,
              club: { select: { shortName: true, name: true } },
            },
          })
        : [];

    const playerMetaById = new Map(playerRecords.map((p) => [p.id, p]));
    const statsByPlayerId = new Map<
      string,
      { minutes: number; totalPoints: number }
    >();

    const evaluatedPlayers: Array<{
      playerId: string;
      firstName: string;
      lastName: string;
      clubShortName: string;
      position: string;
      minutes: number;
      goalsScored: number;
      assists: number;
      cleanSheets: number;
      bonusPoints: number;
      totalPoints: number;
    }> = [];

    for (const [playerId, stat] of mergedRawStats.entries()) {
      const meta = playerMetaById.get(playerId);
      if (!meta) continue;

      const resolvedCleanSheets =
        stat.cleanSheets !== undefined
          ? stat.cleanSheets
          : stat.minutes >= 60 && stat.goalsConceded === 0
            ? 1
            : 0;

      const totalPoints = calculatePlayerMatchPoints({
        position: meta.position as Position,
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

      statsByPlayerId.set(playerId, {
        minutes: stat.minutes,
        totalPoints,
      });

      evaluatedPlayers.push({
        playerId,
        firstName: meta.firstName,
        lastName: meta.lastName,
        clubShortName: meta.club.shortName,
        position: meta.position,
        minutes: stat.minutes,
        goalsScored: stat.goalsScored,
        assists: stat.assists,
        cleanSheets: resolvedCleanSheets,
        bonusPoints: stat.bonusPoints,
        totalPoints,
      });
    }

    evaluatedPlayers.sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.goalsScored - a.goalsScored ||
        b.assists - a.assists ||
        b.minutes - a.minutes
    );

    const topPlayers = evaluatedPlayers.slice(0, 5);

    // 2. Dry-run evaluate all registered squads without writing to the database
    const squads = await prisma.squad.findMany({
      include: {
        user: { select: { name: true, email: true } },
        players: {
          include: {
            player: {
              select: { id: true, firstName: true, lastName: true, position: true },
            },
          },
          orderBy: { positionOrder: "asc" },
        },
        snapshots: {
          where: { gameweekId },
          select: { chipPlayed: true },
        },
        transfers: {
          where: { gameweekId },
          select: { cost: true },
        },
      },
    });

    const evaluatedManagers: Array<{
      rank: number;
      squadId: string;
      squadName: string;
      managerName: string;
      gameweekPoints: number;
      transferHit: number;
      netPoints: number;
      chipPlayed: string | null;
      captainName: string;
      autoSubsCount: number;
    }> = [];

    for (const squad of squads) {
      const chipPlayed = squad.snapshots[0]?.chipPlayed ?? null;
      const scoreResult = calculateSquadGameweekScore(
        squad.players.map((sp) => ({
          playerId: sp.playerId,
          position: sp.player.position as Position,
          positionOrder: sp.positionOrder,
          isCaptain: sp.isCaptain,
          isViceCaptain: sp.isViceCaptain,
        })),
        statsByPlayerId,
        chipPlayed
      );

      const transferHit =
        chipPlayed === "WILDCARD" || chipPlayed === "FREE_HIT"
          ? 0
          : squad.transfers.reduce((sum, t) => sum + t.cost, 0);

      const netPoints = scoreResult.totalPoints - transferHit;

      const activeCaptainEntry = scoreResult.players.find(
        (p) => p.multiplier >= 2
      );
      const captainPlayer = squad.players.find(
        (sp) =>
          sp.playerId ===
          (activeCaptainEntry?.playerId ??
            squad.players.find((x) => x.isCaptain)?.playerId)
      );

      const autoSubsCount = scoreResult.substitutions.length;

      evaluatedManagers.push({
        rank: 0,
        squadId: squad.id,
        squadName: squad.name,
        managerName: squad.user.name || squad.user.email.split("@")[0],
        gameweekPoints: scoreResult.totalPoints,
        transferHit,
        netPoints,
        chipPlayed,
        captainName: captainPlayer
          ? captainPlayer.player.lastName
          : "—",
        autoSubsCount,
      });
    }

    evaluatedManagers.sort(
      (a, b) =>
        b.netPoints - a.netPoints || b.gameweekPoints - a.gameweekPoints
    );

    let currentRank = 1;
    for (let i = 0; i < evaluatedManagers.length; i++) {
      if (
        i > 0 &&
        evaluatedManagers[i].netPoints < evaluatedManagers[i - 1].netPoints
      ) {
        currentRank = i + 1;
      }
      evaluatedManagers[i].rank = currentRank;
    }

    const totalSquadsEvaluated = evaluatedManagers.length;
    const sumPoints = evaluatedManagers.reduce((s, m) => s + m.netPoints, 0);
    const averagePoints =
      totalSquadsEvaluated > 0 ? Math.round(sumPoints / totalSquadsEvaluated) : 0;
    const highestPoints =
      totalSquadsEvaluated > 0 ? evaluatedManagers[0].netPoints : 0;

    return NextResponse.json({
      success: true,
      gameweekId,
      totalSquadsEvaluated,
      performancesEvaluated: evaluatedPlayers.length,
      averagePoints,
      highestPoints,
      topManagers: evaluatedManagers.slice(0, 5),
      topPlayers,
    });
  } catch (error) {
    console.error("POST /api/admin/preview-points error:", error);
    return NextResponse.json(
      { error: "Failed to compute gameweek points preview." },
      { status: 500 }
    );
  }
}
