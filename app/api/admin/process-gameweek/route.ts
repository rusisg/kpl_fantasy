import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { Position } from "../../../../lib/types";
import {
  buildFreeHitRestoredSquad,
  calculatePlayerMatchPoints,
  calculateSquadGameweekScore,
} from "../../../../lib/scoring-engine";

const MatchStatPayloadSchema = z.object({
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

const ProcessGameweekPayloadSchema = z
  .object({
    gameweekId: z.number().int().positive().optional(),
    markFinished: z.boolean().default(false),
    performances: z.array(MatchStatPayloadSchema).optional(),
  })
  .optional();

function verifyAdminSecret(request: Request): boolean {
  const configuredSecret = process.env.ADMIN_SECRET;
  const providedSecret = request.headers.get("x-admin-secret");
  if (!configuredSecret || !providedSecret) {
    return false;
  }
  const a = Buffer.from(configuredSecret, "utf8");
  const b = Buffer.from(providedSecret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!verifyAdminSecret(request)) {
    return NextResponse.json(
      { success: false, error: "Forbidden: Invalid or missing x-admin-secret header." },
      { status: 403 }
    );
  }

  try {
    let rawBody: unknown = undefined;
    const text = await request.text();
    if (text.trim().length > 0) {
      try {
        rawBody = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON payload." },
          { status: 400 }
        );
      }
    }

    const parsed = ProcessGameweekPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid payload.",
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    // 1. Resolve target Gameweek (explicit id or active isCurrent=true)
    const gameweek = payload?.gameweekId
      ? await prisma.gameweek.findUnique({ where: { id: payload.gameweekId } })
      : await prisma.gameweek.findFirst({ where: { isCurrent: true } });

    if (!gameweek) {
      return NextResponse.json(
        { success: false, error: "No active Gameweek found to process." },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 2. If new match stats were supplied in the request, upsert them first
      if (payload?.performances && payload.performances.length > 0) {
        const playerIds = payload.performances.map((p) => p.playerId);
        const players = await tx.player.findMany({
          where: { id: { in: playerIds } },
          select: { id: true, position: true },
        });
        const posByPlayer = new Map(
          players.map((p) => [p.id, p.position as Position])
        );

        for (const stat of payload.performances) {
          const position = posByPlayer.get(stat.playerId);
          if (!position) continue;

          const computedPoints = calculatePlayerMatchPoints({
            position,
            minutes: stat.minutes,
            goalsScored: stat.goalsScored,
            assists: stat.assists,
            cleanSheets: stat.cleanSheets,
            goalsConceded: stat.goalsConceded,
            saves: stat.saves,
            penaltiesSaved: stat.penaltiesSaved,
            penaltiesMissed: stat.penaltiesMissed,
            yellowCards: stat.yellowCards,
            redCards: stat.redCards,
            ownGoals: stat.ownGoals,
            bonusPoints: stat.bonusPoints,
          });

          const resolvedCleanSheets =
            stat.cleanSheets !== undefined
              ? stat.cleanSheets
              : stat.minutes >= 60 && stat.goalsConceded === 0
                ? 1
                : 0;

          await tx.playerPerformance.upsert({
            where: {
              playerId_gameweekId: {
                playerId: stat.playerId,
                gameweekId: gameweek.id,
              },
            },
            create: {
              playerId: stat.playerId,
              gameweekId: gameweek.id,
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
        }
      }

      // 3. Recompute totalPoints on all PlayerPerformance records in this Gameweek
      const gwPerformances = await tx.playerPerformance.findMany({
        where: { gameweekId: gameweek.id },
        include: {
          player: { select: { id: true, position: true } },
        },
      });

      const statsByPlayerId = new Map<
        string,
        { minutes: number; totalPoints: number }
      >();

      for (const perf of gwPerformances) {
        const recalculated = calculatePlayerMatchPoints({
          position: perf.player.position as Position,
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
        });

        if (recalculated !== perf.totalPoints) {
          await tx.playerPerformance.update({
            where: { id: perf.id },
            data: { totalPoints: recalculated },
          });
        }

        statsByPlayerId.set(perf.playerId, {
          minutes: perf.minutes,
          totalPoints: recalculated,
        });
      }

      // 4. Update cumulative Player.totalPoints across all gameweeks for affected players
      if (statsByPlayerId.size > 0) {
        const affectedPlayerIds = Array.from(statsByPlayerId.keys());
        const totalsByPlayer = await tx.playerPerformance.groupBy({
          by: ["playerId"],
          where: { playerId: { in: affectedPlayerIds } },
          _sum: { totalPoints: true },
        });

        for (const agg of totalsByPlayer) {
          await tx.player.update({
            where: { id: agg.playerId },
            data: { totalPoints: agg._sum.totalPoints ?? 0 },
          });
        }
      }

      // 5. Evaluate every Squad, write immutable SquadSnapshot & SquadSnapshotPlayer records,
      //    and update Squad.totalPoints
      const squads = await tx.squad.findMany({
        include: {
          players: {
            include: {
              player: { select: { id: true, position: true } },
            },
            orderBy: { positionOrder: "asc" },
          },
          snapshots: {
            where: { gameweekId: gameweek.id },
            select: { id: true, chipPlayed: true },
          },
          transfers: {
            where: { gameweekId: gameweek.id },
            select: { cost: true },
          },
        },
      });

      const snapshotScores: { snapshotId: string; squadId: string; totalPoints: number }[] = [];

      for (const squad of squads) {
        const existingSnapshot = squad.snapshots[0];
        const chipPlayed = existingSnapshot?.chipPlayed ?? null;

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

        const netTotalPoints = scoreResult.totalPoints - transferHit;

        const snapshot = await tx.squadSnapshot.upsert({
          where: {
            squadId_gameweekId: {
              squadId: squad.id,
              gameweekId: gameweek.id,
            },
          },
          create: {
            squadId: squad.id,
            gameweekId: gameweek.id,
            totalPoints: netTotalPoints,
            chipPlayed,
          },
          update: {
            totalPoints: netTotalPoints,
          },
        });

        await tx.squadSnapshotPlayer.deleteMany({
          where: { snapshotId: snapshot.id },
        });

        if (scoreResult.players.length > 0) {
          await tx.squadSnapshotPlayer.createMany({
            data: scoreResult.players.map((p) => ({
              snapshotId: snapshot.id,
              playerId: p.playerId,
              positionOrder: p.positionOrder,
              isCaptain: p.isCaptain,
              isViceCaptain: p.isViceCaptain,
              multiplier: p.multiplier,
              points: p.points,
            })),
          });
        }

        snapshotScores.push({
          snapshotId: snapshot.id,
          squadId: squad.id,
          totalPoints: netTotalPoints,
        });
      }

      // 6. Compute and assign Gameweek ranks (1-indexed with standard competition tie-breaking)
      snapshotScores.sort((a, b) => b.totalPoints - a.totalPoints);
      let currentRank = 1;
      for (let i = 0; i < snapshotScores.length; i++) {
        if (i > 0 && snapshotScores[i].totalPoints < snapshotScores[i - 1].totalPoints) {
          currentRank = i + 1;
        }
        await tx.squadSnapshot.update({
          where: { id: snapshotScores[i].snapshotId },
          data: { rank: currentRank },
        });
      }

      // 7. Recompute cumulative Squad.totalPoints from all scored SquadSnapshots
      if (squads.length > 0) {
        const squadTotals = await tx.squadSnapshot.groupBy({
          by: ["squadId"],
          where: { players: { some: {} } },
          _sum: { totalPoints: true },
        });
        for (const st of squadTotals) {
          await tx.squad.update({
            where: { id: st.squadId },
            data: { totalPoints: st._sum.totalPoints ?? 0 },
          });
        }
      }

      // 8. Optionally mark Gameweek finished, revert Free Hit squads, roll over free transfers, and advance isCurrent
      if (payload?.markFinished) {
        for (const squad of squads) {
          const chipPlayed = squad.snapshots[0]?.chipPlayed ?? null;
          const nextFreeTransfers =
            chipPlayed === "WILDCARD" || chipPlayed === "FREE_HIT"
              ? 1
              : Math.min(2, squad.freeTransfers + 1);

          let restoredBudget: number | undefined = undefined;

          if (chipPlayed === "FREE_HIT" && gameweek.id > 1) {
            const priorSnapshot = await tx.squadSnapshot.findUnique({
              where: {
                squadId_gameweekId: {
                  squadId: squad.id,
                  gameweekId: gameweek.id - 1,
                },
              },
              include: {
                players: {
                  include: {
                    player: { select: { id: true, price: true } },
                  },
                  orderBy: { positionOrder: "asc" },
                },
              },
            });

            if (priorSnapshot && priorSnapshot.players.length === 15) {
              const currentPurchasePrices = new Map<string, number>();
              for (const sp of squad.players) {
                const locked = Number(sp.purchasePrice);
                if (locked > 0) {
                  currentPurchasePrices.set(sp.playerId, locked);
                }
              }

              const priceByPlayerId = new Map<string, number>();
              for (const snapPlayer of priorSnapshot.players) {
                const lockedOrMarket =
                  currentPurchasePrices.get(snapPlayer.playerId) ??
                  Number(snapPlayer.player.price);
                priceByPlayerId.set(snapPlayer.playerId, lockedOrMarket);
              }

              const restorationPlan = buildFreeHitRestoredSquad(
                priorSnapshot.players.map((p) => ({
                  playerId: p.playerId,
                  positionOrder: p.positionOrder,
                  isCaptain: p.isCaptain,
                  isViceCaptain: p.isViceCaptain,
                })),
                priceByPlayerId
              );

              if (restorationPlan) {
                await tx.squadPlayer.deleteMany({
                  where: { squadId: squad.id },
                });
                await tx.squadPlayer.createMany({
                  data: restorationPlan.players.map((rp) => ({
                    squadId: squad.id,
                    playerId: rp.playerId,
                    positionOrder: rp.positionOrder,
                    purchasePrice: rp.purchasePrice,
                    isCaptain: rp.isCaptain,
                    isViceCaptain: rp.isViceCaptain,
                  })),
                });
                restoredBudget = restorationPlan.remainingBudget;
              }
            }
          }

          await tx.squad.update({
            where: { id: squad.id },
            data: {
              freeTransfers: nextFreeTransfers,
              ...(restoredBudget !== undefined ? { budget: restoredBudget } : {}),
            },
          });
        }

        await tx.gameweek.update({
          where: { id: gameweek.id },
          data: { isFinished: true, isCurrent: false },
        });

        const nextGw = await tx.gameweek.findFirst({
          where: { id: { gt: gameweek.id }, isFinished: false },
          orderBy: { id: "asc" },
        });

        if (nextGw) {
          await tx.gameweek.update({
            where: { id: nextGw.id },
            data: { isCurrent: true },
          });
        }
      }

      return {
        gameweekId: gameweek.id,
        performancesProcessed: statsByPlayerId.size,
        squadsProcessed: squads.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Gameweek ${result.gameweekId} processed successfully.`,
      data: result,
    });
  } catch (error) {
    console.error("POST /api/admin/process-gameweek error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process gameweek points." },
      { status: 500 }
    );
  }
}
