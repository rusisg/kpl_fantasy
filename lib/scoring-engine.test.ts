import { test } from "node:test";
import assert from "node:assert/strict";
import { Position } from "./types.js";
import {
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

  // Case 2: Captain (p10) plays 0 mins (0 pts); Vice (p11) plays 90 mins with 6 base pts -> promoted to 2x (12 pts); other 9 starters score 2 pts each (18) => Total = 30
  const statsInactiveCaptain = new Map(statsActiveCaptain);
  statsInactiveCaptain.set("p10", { minutes: 0, totalPoints: 0 });

  const res2 = calculateSquadGameweekScore(squad, statsInactiveCaptain);
  assert.equal(res2.captainPromotedToVice, true);
  assert.equal(res2.totalPoints, 30);
  const viceRecord = res2.players.find((p) => p.playerId === "p11");
  assert.equal(viceRecord?.multiplier, 2);
  assert.equal(viceRecord?.points, 12);
});
