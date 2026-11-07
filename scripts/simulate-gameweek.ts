import "dotenv/config";
import { FixtureStatus, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { Position } from "../lib/types";
import { resolveClubStrength } from "../lib/fdr";
import {
  buildFreeHitRestoredSquad,
  calculatePlayerMatchPoints,
  calculateSquadGameweekScore,
} from "../lib/scoring-engine";

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface ClubPlayerRow {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
  clubId: string;
  clubShortName: string;
}

interface GeneratedPerformance {
  playerId: string;
  playerName: string;
  clubShortName: string;
  position: Position;
  fixtureId: string;
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
}

/**
 * Simple seeded PRNG (Mulberry32) so simulations are realistic and reproducible per gameweek/fixture.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 7);
  return Math.max(0, k - 1);
}

function pickWeighted<T>(
  items: T[],
  weightFn: (item: T) => number,
  rng: () => number
): T | null {
  if (items.length === 0) return null;
  const weights = items.map((item) => Math.max(0.01, weightFn(item)));
  const total = weights.reduce((acc, w) => acc + w, 0);
  let threshold = rng() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i];
    if (threshold <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

function simulateClubMatchPerformances(
  clubPlayers: ClubPlayerRow[],
  fixtureId: string,
  goalsFor: number,
  goalsAgainst: number,
  rng: () => number
): Omit<GeneratedPerformance, "bonusPoints" | "totalPoints">[] {
  const byPos: Record<Position, ClubPlayerRow[]> = {
    [Position.GK]: [],
    [Position.DEF]: [],
    [Position.MID]: [],
    [Position.FWD]: [],
  };

  for (const p of clubPlayers) {
    byPos[p.position].push(p);
  }

  // Sort by price descending with slight random jitter for squad rotation
  for (const pos of [Position.GK, Position.DEF, Position.MID, Position.FWD]) {
    byPos[pos].sort((a, b) => b.price - a.price + (rng() - 0.5) * 0.8);
  }

  const starters: ClubPlayerRow[] = [
    ...byPos[Position.GK].slice(0, 1),
    ...byPos[Position.DEF].slice(0, 4),
    ...byPos[Position.MID].slice(0, 4),
    ...byPos[Position.FWD].slice(0, 2),
  ];
  const starterIds = new Set(starters.map((s) => s.id));

  const remainingOutfield = clubPlayers
    .filter((p) => !starterIds.has(p.id) && p.position !== Position.GK)
    .sort((a, b) => b.price - a.price);

  const subCameos = remainingOutfield.slice(0, Math.min(3, remainingOutfield.length));
  const subIds = new Set(subCameos.map((s) => s.id));

  const minutesByPlayerId = new Map<string, number>();

  // Assign minutes: up to 3 starters get subbed off between 62' and 84', replaced by cameo subs
  const subbedOffStarters = starters
    .filter((s) => s.position !== Position.GK)
    .slice(-subCameos.length);
  const subbedOffMap = new Map<string, number>();

  subbedOffStarters.forEach((starter, idx) => {
    const subMinute = 62 + Math.floor(rng() * 23); // 62..84 -> still >=60 mins
    subbedOffMap.set(starter.id, subMinute);
    const cameo = subCameos[idx];
    if (cameo) {
      minutesByPlayerId.set(cameo.id, 90 - subMinute);
    }
  });

  for (const s of starters) {
    minutesByPlayerId.set(s.id, subbedOffMap.get(s.id) ?? 90);
  }

  for (const p of clubPlayers) {
    if (!starterIds.has(p.id) && !subIds.has(p.id)) {
      minutesByPlayerId.set(p.id, 0);
    }
  }

  const activeOutfield = clubPlayers.filter(
    (p) => (minutesByPlayerId.get(p.id) ?? 0) > 0 && p.position !== Position.GK
  );

  const goalsByPlayerId = new Map<string, number>();
  const assistsByPlayerId = new Map<string, number>();

  for (let g = 0; g < goalsFor; g++) {
    const scorer = pickWeighted(
      activeOutfield,
      (p) => {
        const posWeight =
          p.position === Position.FWD
            ? 4.2
            : p.position === Position.MID
              ? 2.6
              : 0.9;
        return posWeight * (p.price / 5.0);
      },
      rng
    );

    if (scorer) {
      goalsByPlayerId.set(scorer.id, (goalsByPlayerId.get(scorer.id) ?? 0) + 1);

      // 78% of goals have an assist from a teammate
      if (rng() < 0.78) {
        const assistCandidates = activeOutfield.filter(
          (p) => p.id !== scorer.id
        );
        const assister = pickWeighted(
          assistCandidates,
          (p) => {
            const posWeight =
              p.position === Position.MID
                ? 3.8
                : p.position === Position.FWD
                  ? 2.4
                  : 1.5;
            return posWeight * (p.price / 5.0);
          },
          rng
        );
        if (assister) {
          assistsByPlayerId.set(
            assister.id,
            (assistsByPlayerId.get(assister.id) ?? 0) + 1
          );
        }
      }
    }
  }

  return clubPlayers.map((p) => {
    const minutes = minutesByPlayerId.get(p.id) ?? 0;
    const goalsScored = goalsByPlayerId.get(p.id) ?? 0;
    const assists = assistsByPlayerId.get(p.id) ?? 0;
    const cleanSheets = minutes >= 60 && goalsAgainst === 0 ? 1 : 0;
    const goalsConceded = minutes > 0 ? goalsAgainst : 0;

    let saves = 0;
    let penaltiesSaved = 0;
    if (p.position === Position.GK && minutes > 0) {
      saves = 2 + Math.floor(rng() * 5); // 2..6 saves
      if (rng() < 0.08) {
        penaltiesSaved = 1;
      }
    }

    const yellowCards = minutes > 0 && rng() < 0.11 ? 1 : 0;
    const redCards = minutes > 0 && yellowCards === 0 && rng() < 0.01 ? 1 : 0;

    return {
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`.trim(),
      clubShortName: p.clubShortName,
      position: p.position,
      fixtureId,
      minutes,
      goalsScored,
      assists,
      cleanSheets,
      goalsConceded,
      saves,
      penaltiesSaved,
      penaltiesMissed: 0,
      yellowCards,
      redCards,
      ownGoals: 0,
    };
  });
}

async function main() {
  const gwArg = process.argv.find((arg) => arg.startsWith("--gw="));
  const explicitGwId = gwArg ? Number(gwArg.split("=")[1]) : null;

  // 1. Identify target Gameweek (explicit --gw=N, active isCurrent=true, or first unfinished)
  let gameweek =
    explicitGwId && Number.isInteger(explicitGwId)
      ? await prisma.gameweek.findUnique({ where: { id: explicitGwId } })
      : await prisma.gameweek.findFirst({
          where: { isCurrent: true },
          orderBy: { id: "asc" },
        });

  if (!gameweek) {
    gameweek =
      (await prisma.gameweek.findFirst({
        where: { isFinished: false },
        orderBy: { id: "asc" },
      })) ??
      (await prisma.gameweek.findFirst({
        orderBy: { id: "asc" },
      }));
  }

  if (!gameweek) {
    throw new Error("No Gameweeks found in database. Run `npx prisma db seed` first.");
  }

  const fixtures = await prisma.fixture.findMany({
    where: { gameweekId: gameweek.id },
    orderBy: { kickoffTime: "asc" },
    include: {
      homeClub: true,
      awayClub: true,
    },
  });

  if (fixtures.length === 0) {
    throw new Error(`Gameweek ${gameweek.id} has no scheduled fixtures.`);
  }

  const clubIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]))
  );

  const allClubPlayers = await prisma.player.findMany({
    where: { clubId: { in: clubIds } },
    include: { club: { select: { shortName: true } } },
  });

  const playersByClubId = new Map<string, ClubPlayerRow[]>();
  for (const p of allClubPlayers) {
    const list = playersByClubId.get(p.clubId) ?? [];
    list.push({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position as Position,
      price: Number(p.price),
      clubId: p.clubId,
      clubShortName: p.club.shortName,
    });
    playersByClubId.set(p.clubId, list);
  }

  const rng = createRng(gameweek.id * 9973 + 2026);

  const simulatedFixtures: {
    id: string;
    homeShort: string;
    homeName: string;
    awayShort: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
  }[] = [];

  const allGeneratedPerformances: GeneratedPerformance[] = [];

  // 2. Simulate realistic KPL scores & position-weighted player match stats for each fixture
  for (const fx of fixtures) {
    const homeStrength = resolveClubStrength(fx.homeClub.shortName);
    const awayStrength = resolveClubStrength(fx.awayClub.shortName);

    const homeLambda = Math.max(
      0.55,
      Math.min(2.6, 1.35 + (homeStrength - awayStrength) * 0.32)
    );
    const awayLambda = Math.max(
      0.4,
      Math.min(2.3, 1.05 + (awayStrength - homeStrength) * 0.28)
    );

    const homeScore = samplePoisson(homeLambda, rng);
    const awayScore = samplePoisson(awayLambda, rng);

    simulatedFixtures.push({
      id: fx.id,
      homeShort: fx.homeClub.shortName,
      homeName: fx.homeClub.name,
      awayShort: fx.awayClub.shortName,
      awayName: fx.awayClub.name,
      homeScore,
      awayScore,
    });

    const homeRoster = playersByClubId.get(fx.homeClubId) ?? [];
    const awayRoster = playersByClubId.get(fx.awayClubId) ?? [];

    const rawFixturePerfs = [
      ...simulateClubMatchPerformances(
        homeRoster,
        fx.id,
        homeScore,
        awayScore,
        rng
      ),
      ...simulateClubMatchPerformances(
        awayRoster,
        fx.id,
        awayScore,
        homeScore,
        rng
      ),
    ];

    // Calculate base points first, then award 3 / 2 / 1 bonus points to top 3 active players in the fixture
    const withBase = rawFixturePerfs.map((perf) => {
      const basePts = calculatePlayerMatchPoints({
        position: perf.position,
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
        bonusPoints: 0,
      });
      return { ...perf, basePts };
    });

    const activeRanked = withBase
      .filter((p) => p.minutes > 0)
      .slice()
      .sort(
        (a, b) =>
          b.basePts - a.basePts ||
          b.goalsScored - a.goalsScored ||
          b.assists - a.assists
      );

    const bonusByPlayerId = new Map<string, number>();
    if (activeRanked[0]) bonusByPlayerId.set(activeRanked[0].playerId, 3);
    if (activeRanked[1]) bonusByPlayerId.set(activeRanked[1].playerId, 2);
    if (activeRanked[2]) bonusByPlayerId.set(activeRanked[2].playerId, 1);

    for (const p of withBase) {
      const bonusPoints = bonusByPlayerId.get(p.playerId) ?? 0;
      const totalPoints = calculatePlayerMatchPoints({
        position: p.position,
        minutes: p.minutes,
        goalsScored: p.goalsScored,
        assists: p.assists,
        cleanSheets: p.cleanSheets,
        goalsConceded: p.goalsConceded,
        saves: p.saves,
        penaltiesSaved: p.penaltiesSaved,
        penaltiesMissed: p.penaltiesMissed,
        yellowCards: p.yellowCards,
        redCards: p.redCards,
        ownGoals: p.ownGoals,
        bonusPoints,
      });

      allGeneratedPerformances.push({
        playerId: p.playerId,
        playerName: p.playerName,
        clubShortName: p.clubShortName,
        position: p.position,
        fixtureId: p.fixtureId,
        minutes: p.minutes,
        goalsScored: p.goalsScored,
        assists: p.assists,
        cleanSheets: p.cleanSheets,
        goalsConceded: p.goalsConceded,
        saves: p.saves,
        penaltiesSaved: p.penaltiesSaved,
        penaltiesMissed: p.penaltiesMissed,
        yellowCards: p.yellowCards,
        redCards: p.redCards,
        ownGoals: p.ownGoals,
        bonusPoints,
        totalPoints,
      });
    }
  }

  // 3. Execute atomic Gameweek scoring & state transition transaction
  const summary = await prisma.$transaction(async (tx) => {
    // 3a. Update Fixture scores and mark FINISHED
    for (const fx of simulatedFixtures) {
      await tx.fixture.update({
        where: { id: fx.id },
        data: {
          homeScore: fx.homeScore,
          awayScore: fx.awayScore,
          status: FixtureStatus.FINISHED,
        },
      });
    }

    // 3b. Replace & insert PlayerPerformance rows for this Gameweek
    await tx.playerPerformance.deleteMany({
      where: { gameweekId: gameweek.id },
    });

    if (allGeneratedPerformances.length > 0) {
      await tx.playerPerformance.createMany({
        data: allGeneratedPerformances.map((perf) => ({
          playerId: perf.playerId,
          gameweekId: gameweek.id,
          fixtureId: perf.fixtureId,
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
        })),
      });
    }

    // 3c. Recompute cumulative Player.totalPoints across all gameweeks
    const affectedPlayerIds = allGeneratedPerformances.map((p) => p.playerId);
    if (affectedPlayerIds.length > 0) {
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

    const statsByPlayerId = new Map<
      string,
      { minutes: number; totalPoints: number }
    >(
      allGeneratedPerformances.map((p) => [
        p.playerId,
        { minutes: p.minutes, totalPoints: p.totalPoints },
      ])
    );

    // 3d. Evaluate all registered Squads, resolve auto-subs & captaincy failovers, save SquadSnapshots
    const squads = await tx.squad.findMany({
      include: {
        user: { select: { name: true, email: true } },
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

    const evaluatedSquadSummaries: {
      snapshotId: string;
      squadId: string;
      squadName: string;
      managerName: string;
      gwPoints: number;
      autoSubsCount: number;
      captainPromotedToVice: boolean;
      chipPlayed: string | null;
      rank: number;
      seasonTotalPoints: number;
    }[] = [];

    for (const squad of squads) {
      if (squad.players.length === 0) continue;

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
            positionOrder: p.originalPositionOrder,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
            multiplier: p.multiplier,
            points: p.points,
          })),
        });
      }

      evaluatedSquadSummaries.push({
        snapshotId: snapshot.id,
        squadId: squad.id,
        squadName: squad.name,
        managerName:
          squad.user.name || squad.user.email.split("@")[0] || "Manager",
        gwPoints: netTotalPoints,
        autoSubsCount: scoreResult.substitutions.length,
        captainPromotedToVice: scoreResult.captainPromotedToVice,
        chipPlayed,
        rank: 1,
        seasonTotalPoints: 0,
      });
    }

    // 3e. Assign 1-indexed Gameweek rank across all snapshots
    evaluatedSquadSummaries.sort((a, b) => b.gwPoints - a.gwPoints);
    let currentRank = 1;
    for (let i = 0; i < evaluatedSquadSummaries.length; i++) {
      if (
        i > 0 &&
        evaluatedSquadSummaries[i].gwPoints <
          evaluatedSquadSummaries[i - 1].gwPoints
      ) {
        currentRank = i + 1;
      }
      evaluatedSquadSummaries[i].rank = currentRank;
      await tx.squadSnapshot.update({
        where: { id: evaluatedSquadSummaries[i].snapshotId },
        data: { rank: currentRank },
      });
    }

    // 3f. Recompute cumulative Squad.totalPoints (driving all League standings)
    if (evaluatedSquadSummaries.length > 0) {
      const squadTotals = await tx.squadSnapshot.groupBy({
        by: ["squadId"],
        where: { players: { some: {} } },
        _sum: { totalPoints: true },
      });
      const totalBySquadId = new Map<string, number>();
      for (const st of squadTotals) {
        const sumPts = st._sum.totalPoints ?? 0;
        totalBySquadId.set(st.squadId, sumPts);
        await tx.squad.update({
          where: { id: st.squadId },
          data: { totalPoints: sumPts },
        });
      }
      for (const item of evaluatedSquadSummaries) {
        item.seasonTotalPoints =
          totalBySquadId.get(item.squadId) ?? item.gwPoints;
      }
    }

    // 3g. Handle Free Hit squad reversion and roll over freeTransfers
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

    // 3h. Mark current Gameweek finished and activate the next Gameweek
    await tx.gameweek.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });

    await tx.gameweek.update({
      where: { id: gameweek.id },
      data: { isFinished: true, isCurrent: false },
    });

    let nextGw = await tx.gameweek.findFirst({
      where: { id: { gt: gameweek.id }, isFinished: false },
      orderBy: { id: "asc" },
    });

    if (!nextGw) {
      // If later rounds were pre-seeded as finished or we reached the final round,
      // advance to the next sequential round (or wrap to GW 1) and unlock it.
      nextGw =
        (await tx.gameweek.findFirst({
          where: { id: { gt: gameweek.id } },
          orderBy: { id: "asc" },
        })) ??
        (await tx.gameweek.findFirst({
          orderBy: { id: "asc" },
        }));
    }

    let nextActiveGameweekId: number | null = null;
    if (nextGw && nextGw.id !== gameweek.id) {
      const futureDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await tx.gameweek.update({
        where: { id: nextGw.id },
        data: {
          isCurrent: true,
          isFinished: false,
          deadline:
            nextGw.deadline.getTime() > Date.now()
              ? nextGw.deadline
              : futureDeadline,
        },
      });
      nextActiveGameweekId = nextGw.id;
    }

    return {
      simulatedGameweekId: gameweek.id,
      nextActiveGameweekId,
      squadScores: evaluatedSquadSummaries,
    };
  });

  // 4. Print Formatted Terminal Summary
  const divider = "═".repeat(68);
  console.log(`\n${divider}`);
  console.log(
    `⚽ KPL FANTASY — GAMEWEEK ${summary.simulatedGameweekId} SIMULATION COMPLETE`
  );
  console.log(divider);

  console.log(`\n📋 MATCH RESULTS (GW ${summary.simulatedGameweekId}):`);
  for (const fx of simulatedFixtures) {
    const left = `${fx.homeName} (${fx.homeShort})`.padEnd(26, " ");
    const score = `${fx.homeScore} - ${fx.awayScore}`;
    const right = `(${fx.awayShort}) ${fx.awayName}`;
    console.log(`   • ${left}  [${score}]  ${right}`);
  }

  const topScorers = allGeneratedPerformances
    .slice()
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.goalsScored - a.goalsScored ||
        b.assists - a.assists
    )
    .slice(0, 5);

  console.log(`\n🌟 TOP 5 FANTASY SCORERS OF ROUND ${summary.simulatedGameweekId}:`);
  topScorers.forEach((p, idx) => {
    const tags: string[] = [`${p.minutes}'`];
    if (p.goalsScored > 0) tags.push(`${p.goalsScored}G`);
    if (p.assists > 0) tags.push(`${p.assists}A`);
    if (p.cleanSheets > 0 && (p.position === "GK" || p.position === "DEF" || p.position === "MID")) {
      tags.push("CS");
    }
    if (p.saves >= 3) tags.push(`${p.saves}SV`);
    if (p.bonusPoints > 0) tags.push(`+${p.bonusPoints}BP`);
    console.log(
      `   ${idx + 1}. ${p.playerName.padEnd(22, " ")} [${p.clubShortName} • ${p.position}] — ${String(p.totalPoints).padStart(2, " ")} pts (${tags.join(", ")})`
    );
  });

  console.log(
    `\n🏆 MANAGER SQUAD SCORES (${summary.squadScores.length} registered squads):`
  );
  if (summary.squadScores.length === 0) {
    console.log("   (No registered squads found)");
  } else {
    for (const s of summary.squadScores) {
      const notes: string[] = [];
      if (s.chipPlayed) notes.push(`Chip: ${s.chipPlayed}`);
      if (s.autoSubsCount > 0) notes.push(`Auto-subs: ${s.autoSubsCount}`);
      if (s.captainPromotedToVice) notes.push("Vice-Captain 2x");
      const extra = notes.length > 0 ? ` [${notes.join(" | ")}]` : "";
      console.log(
        `   #${String(s.rank).padEnd(2, " ")} ${s.squadName.padEnd(22, " ")} (${s.managerName}) — GW: ${String(s.gwPoints).padStart(2, " ")} pts | Season: ${String(s.seasonTotalPoints).padStart(3, " ")} pts${extra}`
      );
    }
  }

  console.log(
    `\n⏭️  Gameweek ${summary.simulatedGameweekId} marked FINISHED. Active Gameweek is now: GW ${summary.nextActiveGameweekId ?? "Season Complete"}.`
  );
  console.log(`${divider}\n`);
}

main()
  .catch((err) => {
    console.error("❌ Failed to simulate gameweek:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
