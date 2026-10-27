import { test } from "node:test";
import assert from "node:assert/strict";
import { Position } from "./types.js";
import {
  buildFreeHitRestoredSquad,
  calculatePlayerMatchPoints,
  calculateSquadGameweekScore,
  SquadMemberScoringInput,
} from "./scoring-engine.js";

test("calculatePlayerMatchPoints - returns 0 when minutes played is 0", () => {
  const pts = calculatePlayerMatchPoints({
    position: Position.FWD,
    minutes: 0,
    goalsScored: 2,
    assists: 1,
  });
  assert.equal(pts, 0);
});

test("calculatePlayerMatchPoints - awards 1 pt for <60 mins and 2 pts for >=60 mins", () => {
  assert.equal(
    calculatePlayerMatchPoints({
      position: Position.FWD,
      minutes: 45,
      goalsConceded: 2,
    }),
    1
  );
  assert.equal(
    calculatePlayerMatchPoints({
      position: Position.FWD,
      minutes: 60,
      goalsConceded: 2,
    }),
    2
  );
});

test("calculatePlayerMatchPoints - applies positional goal and clean sheet rules", () => {
  // Defender: 90m (+2), 1 goal (+6), 1 assist (+3), clean sheet (+4) = 15
  const defPts = calculatePlayerMatchPoints({
    position: Position.DEF,
    minutes: 90,
    goalsScored: 1,
    assists: 1,
    cleanSheets: 1,
    goalsConceded: 0,
  });
  assert.equal(defPts, 15);

  // Midfielder: 90m (+2), 1 goal (+5), clean sheet (+1) = 8
  const midPts = calculatePlayerMatchPoints({
    position: Position.MID,
    minutes: 90,
    goalsScored: 1,
    cleanSheets: 1,
    goalsConceded: 0,
  });
  assert.equal(midPts, 8);

  // Forward: 90m (+2), 2 goals (+8), clean sheet (+0) = 10
  const fwdPts = calculatePlayerMatchPoints({
    position: Position.FWD,
    minutes: 90,
    goalsScored: 2,
    cleanSheets: 1,
    goalsConceded: 0,
  });
  assert.equal(fwdPts, 10);

  // Defender subbed off at 59m does NOT earn clean sheet: 59m (+1) = 1
  const subDefPts = calculatePlayerMatchPoints({
    position: Position.DEF,
    minutes: 59,
    cleanSheets: 1,
    goalsConceded: 0,
  });
  assert.equal(subDefPts, 1);
});

test("calculatePlayerMatchPoints - applies GK penalty save, penalty miss, cards, own goals, and goals conceded deductions", () => {
  // GK: 90m (+2), 1 pen saved (+5), 3 goals conceded (-1), 1 yellow (-1) = 5
  const gkPts = calculatePlayerMatchPoints({
    position: Position.GK,
    minutes: 90,
    cleanSheets: 0,
    goalsConceded: 3,
    penaltiesSaved: 1,
    yellowCards: 1,
  });
  assert.equal(gkPts, 5);

  // DEF nightmare: 90m (+2), 4 goals conceded (-2), 1 own goal (-2), 1 pen missed (-2), 1 red card (-3) = -7
  const nightmareDefPts = calculatePlayerMatchPoints({
    position: Position.DEF,
    minutes: 90,
    cleanSheets: 0,
    goalsConceded: 4,
    ownGoals: 1,
    penaltiesMissed: 1,
    redCards: 1,
  });
  assert.equal(nightmareDefPts, -7);
});

test("calculateSquadGameweekScore - doubles Captain points and promotes Vice-Captain when Captain plays 0 minutes", () => {
  const squad: SquadMemberScoringInput[] = Array.from({ length: 15 }, (_, idx) => {
    const order = idx + 1;
    return {
      playerId: `p${order}`,
      position:
        order === 1 || order === 12
          ? Position.GK
          : order <= 5 || order === 13
            ? Position.DEF
            : order <= 9 || order === 14
              ? Position.MID
              : Position.FWD,
      positionOrder: order,
      isCaptain: order === 10,
      isViceCaptain: order === 11,
    };
  });

  // Case 1: Captain (p10) plays 90 mins and scores 10 base pts -> 20 pts; Vice (p11) scores 6 pts -> 6 pts; other 9 starters score 2 pts each (18) => Total = 44
  const statsActiveCaptain = new Map<string, { minutes: number; totalPoints: number }>();
  for (let i = 1; i <= 15; i++) {
    statsActiveCaptain.set(`p${i}`, {
      minutes: 90,
      totalPoints: i === 10 ? 10 : i === 11 ? 6 : 2,
    });
  }

  const res1 = calculateSquadGameweekScore(squad, statsActiveCaptain);
  assert.equal(res1.captainPromotedToVice, false);
  assert.equal(res1.totalPoints, 44);

  // Case 2: Captain (p10) plays 0 mins (0 pts); Vice (p11) plays 90 mins with 6 base pts -> promoted to 2x (12 pts);
  // other 9 starters score 2 pts each (18) + bench slot 13 (p13, DEF) auto-subs in for p10 with 2 pts => Total = 32
  const statsInactiveCaptain = new Map(statsActiveCaptain);
  statsInactiveCaptain.set("p10", { minutes: 0, totalPoints: 0 });

  const res2 = calculateSquadGameweekScore(squad, statsInactiveCaptain);
  assert.equal(res2.captainPromotedToVice, true);
  assert.equal(res2.totalPoints, 32);
  assert.equal(res2.substitutions.length, 1);
  assert.deepEqual(res2.substitutions[0], {
    playerOutId: "p10",
    playerInId: "p13",
  });
  const viceRecord = res2.players.find((p) => p.playerId === "p11");
  assert.equal(viceRecord?.multiplier, 2);
  assert.equal(viceRecord?.points, 12);
});

test("calculateSquadGameweekScore - auto-subs GK and respects minimum 3-DEF formation constraint", () => {
  // 3-4-3 starting lineup:
  // 1: GK, 2-4: DEF (3 DEFs!), 5-8: MID (4 MIDs), 9-11: FWD (3 FWDs)
  // Bench: 12: GK, 13: MID (1st sub), 14: DEF (2nd sub), 15: DEF (3rd sub)
  const squad343: SquadMemberScoringInput[] = [
    { playerId: "gk1", position: Position.GK, positionOrder: 1, isCaptain: false, isViceCaptain: false },
    { playerId: "d1", position: Position.DEF, positionOrder: 2, isCaptain: false, isViceCaptain: false },
    { playerId: "d2", position: Position.DEF, positionOrder: 3, isCaptain: false, isViceCaptain: false },
    { playerId: "d3", position: Position.DEF, positionOrder: 4, isCaptain: false, isViceCaptain: false },
    { playerId: "m1", position: Position.MID, positionOrder: 5, isCaptain: false, isViceCaptain: false },
    { playerId: "m2", position: Position.MID, positionOrder: 6, isCaptain: false, isViceCaptain: false },
    { playerId: "m3", position: Position.MID, positionOrder: 7, isCaptain: false, isViceCaptain: false },
    { playerId: "m4", position: Position.MID, positionOrder: 8, isCaptain: false, isViceCaptain: false },
    { playerId: "f1", position: Position.FWD, positionOrder: 9, isCaptain: true, isViceCaptain: false },
    { playerId: "f2", position: Position.FWD, positionOrder: 10, isCaptain: false, isViceCaptain: true },
    { playerId: "f3", position: Position.FWD, positionOrder: 11, isCaptain: false, isViceCaptain: false },
    // Bench
    { playerId: "gk2", position: Position.GK, positionOrder: 12, isCaptain: false, isViceCaptain: false },
    { playerId: "m5", position: Position.MID, positionOrder: 13, isCaptain: false, isViceCaptain: false },
    { playerId: "d4", position: Position.DEF, positionOrder: 14, isCaptain: false, isViceCaptain: false },
    { playerId: "d5", position: Position.DEF, positionOrder: 15, isCaptain: false, isViceCaptain: false },
  ];

  const stats = new Map<string, { minutes: number; totalPoints: number }>();
  for (const p of squad343) {
    stats.set(p.playerId, { minutes: 90, totalPoints: 2 });
  }
  // gk1 (starting GK) and d1 (one of only 3 starting DEFs) both play 0 minutes
  stats.set("gk1", { minutes: 0, totalPoints: 0 });
  stats.set("d1", { minutes: 0, totalPoints: 0 });
  // Bench scores: gk2 = 6 pts, m5 (slot 13, MID) = 8 pts, d4 (slot 14, DEF) = 5 pts
  stats.set("gk2", { minutes: 90, totalPoints: 6 });
  stats.set("m5", { minutes: 90, totalPoints: 8 });
  stats.set("d4", { minutes: 90, totalPoints: 5 });

  const result = calculateSquadGameweekScore(squad343, stats);

  // m5 (MID at slot 13) CANNOT replace d1 (DEF) because that would leave only 2 DEFs!
  // Instead, gk2 replaces gk1, and d4 (DEF at slot 14) replaces d1!
  assert.deepEqual(result.substitutions, [
    { playerOutId: "gk1", playerInId: "gk2" },
    { playerOutId: "d1", playerInId: "d4" },
  ]);

  // Expected points:
  // 9 active outfield starters (8*2=16 + captain f1 with 2x2=4 pts => 20)
  // + gk2 (6) + d4 (5) = 31
  assert.equal(result.totalPoints, 31);
});

test("buildFreeHitRestoredSquad - restores 15 pre-Free Hit players, captaincy, and remaining budget", () => {
  const priorPlayers = Array.from({ length: 15 }, (_, idx) => {
    const order = idx + 1;
    return {
      playerId: `prev_p${order}`,
      positionOrder: order,
      isCaptain: order === 9,
      isViceCaptain: order === 10,
    };
  });

  const prices = new Map<string, number>();
  // 15 players at 6.5M each = 97.5M total spent => 2.5M remaining budget
  for (let i = 1; i <= 15; i++) {
    prices.set(`prev_p${i}`, 6.5);
  }

  const plan = buildFreeHitRestoredSquad(priorPlayers, prices, 100.0);
  assert.ok(plan);
  assert.equal(plan.players.length, 15);
  assert.equal(plan.remainingBudget, 2.5);
  assert.equal(plan.players[8]?.playerId, "prev_p9");
  assert.equal(plan.players[8]?.isCaptain, true);
  assert.equal(plan.players[9]?.playerId, "prev_p10");
  assert.equal(plan.players[9]?.isViceCaptain, true);

  // Incomplete prior snapshot (< 15 players) returns null safely
  assert.equal(buildFreeHitRestoredSquad(priorPlayers.slice(0, 11), prices), null);
});
