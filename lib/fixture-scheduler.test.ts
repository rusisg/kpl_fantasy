import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDoubleRoundRobin, totalRoundsFor } from "./fixture-scheduler.js";

test("generateDoubleRoundRobin - 14 clubs produce 26 rounds of 7 matches", () => {
  const matches = generateDoubleRoundRobin(14);
  assert.equal(totalRoundsFor(14), 26);
  assert.equal(matches.length, 26 * 7);

  for (let r = 1; r <= 26; r++) {
    const roundMatches = matches.filter((m) => m.round === r);
    assert.equal(roundMatches.length, 7, `round ${r} should have 7 matches`);
    const clubsInRound = new Set(roundMatches.flatMap((m) => [m.homeIndex, m.awayIndex]));
    assert.equal(clubsInRound.size, 14, `every club plays exactly once in round ${r}`);
  }
});

test("generateDoubleRoundRobin - every ordered pairing (home/away) occurs exactly once", () => {
  const matches = generateDoubleRoundRobin(14);
  const seen = new Set<string>();
  for (const m of matches) {
    assert.notEqual(m.homeIndex, m.awayIndex);
    const key = `${m.homeIndex}-${m.awayIndex}`;
    assert.ok(!seen.has(key), `duplicate fixture ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size, 14 * 13);
});

test("generateDoubleRoundRobin - odd club count inserts byes", () => {
  const matches = generateDoubleRoundRobin(5);
  assert.equal(totalRoundsFor(5), 10);
  assert.equal(matches.length, 5 * 4); // each ordered pair once
  for (let r = 1; r <= 10; r++) {
    assert.equal(matches.filter((m) => m.round === r).length, 2);
  }
});

test("generateDoubleRoundRobin - no club has more than 3 consecutive home or away games", () => {
  const matches = generateDoubleRoundRobin(14);
  for (let club = 0; club < 14; club++) {
    let homeStreak = 0;
    let awayStreak = 0;
    for (let r = 1; r <= 26; r++) {
      const m = matches.find((x) => x.round === r && (x.homeIndex === club || x.awayIndex === club));
      assert.ok(m);
      if (m.homeIndex === club) {
        homeStreak++;
        awayStreak = 0;
      } else {
        awayStreak++;
        homeStreak = 0;
      }
      assert.ok(homeStreak <= 3, `club ${club} has ${homeStreak} straight home games by round ${r}`);
      assert.ok(awayStreak <= 3, `club ${club} has ${awayStreak} straight away games by round ${r}`);
    }
  }
});
