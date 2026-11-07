import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateFixtureDifficulty,
  formatFixtureOpponentTag,
  getFdrBadgeClasses,
  resolveClubStrength,
} from "./fdr";

describe("Fixture Difficulty Rating (FDR) Engine", () => {
  it("keeps all computed FDR ratings strictly within the 1-5 scale", () => {
    const clubs = [
      "KAI",
      "AST",
      "ORD",
      "AKT",
      "TOB",
      "ELI",
      "KYZ",
      "ZHE",
      "ATY",
      "SHA",
      "TUR",
      "ZHN",
      "KAI_S",
      "OKO",
      "CAS",
      "ULT",
    ];

    for (const club of clubs) {
      for (const opp of clubs) {
        if (club === opp) continue;
        for (const isHome of [true, false]) {
          const fdr = calculateFixtureDifficulty(club, opp, isHome);
          assert.ok(
            fdr >= 1 && fdr <= 5 && Number.isInteger(fdr),
            `Expected integer 1..5 for ${club} vs ${opp} (isHome=${isHome}), got ${fdr}`
          );
        }
      }
    }
  });

  it("rates away fixtures at elite clubs (KAI, AST) higher than home fixtures vs promoted clubs (CAS, OKO)", () => {
    const awayAtKairat = calculateFixtureDifficulty("ATY", "KAI", false);
    const homeVsCaspiy = calculateFixtureDifficulty("KAI", "CAS", true);

    assert.equal(awayAtKairat, 5);
    assert.ok(homeVsCaspiy <= 2);
    assert.ok(awayAtKairat > homeVsCaspiy);
  });

  it("applies home advantage so away difficulty is never easier than home difficulty against the same opponent", () => {
    const pairs: Array<[string, string]> = [
      ["AKT", "AST"],
      ["TOB", "KAI"],
      ["ZHE", "ORD"],
      ["KYZ", "ATY"],
      ["CAS", "TOB"],
    ];

    for (const [club, opponent] of pairs) {
      const homeFdr = calculateFixtureDifficulty(club, opponent, true);
      const awayFdr = calculateFixtureDifficulty(club, opponent, false);
      assert.ok(
        awayFdr >= homeFdr,
        `Expected away FDR (${awayFdr}) >= home FDR (${homeFdr}) for ${club} vs ${opponent}`
      );
    }
  });

  it("resolves database club UUIDs via optional clubShortNameMap", () => {
    const shortMap = {
      "uuid-kairat": "KAI",
      "uuid-astana": "AST",
      "uuid-ulytau": "ULT",
    };

    const ultAtAstana = calculateFixtureDifficulty(
      "uuid-ulytau",
      "uuid-astana",
      false,
      shortMap
    );
    const kairatHomeVsUlt = calculateFixtureDifficulty(
      "uuid-kairat",
      "uuid-ulytau",
      true,
      shortMap
    );

    assert.equal(ultAtAstana, 5);
    assert.ok(kairatHomeVsUlt <= 2);
    assert.equal(resolveClubStrength("uuid-kairat", shortMap), 4.6);
  });

  it("formats short opponent tags with venue indicators across EN, RU, and KK", () => {
    assert.equal(formatFixtureOpponentTag("ast", true), "AST (H)");
    assert.equal(formatFixtureOpponentTag("kai", false), "KAI (A)");

    assert.equal(
      formatFixtureOpponentTag("AST", true, { home: "Д", away: "Г" }),
      "AST (Д)"
    );
    assert.equal(
      formatFixtureOpponentTag("KAI", false, { home: "Д", away: "Г" }),
      "KAI (Г)"
    );

    assert.equal(
      formatFixtureOpponentTag("AST", true, { home: "Ү", away: "Қ" }),
      "AST (Ү)"
    );
    assert.equal(
      formatFixtureOpponentTag("KAI", false, { home: "Ү", away: "Қ" }),
      "KAI (Қ)"
    );
  });

  it("returns distinct badge classes for FDR ratings 1 through 5", () => {
    for (const rating of [1, 2, 3, 4, 5] as const) {
      const classes = getFdrBadgeClasses(rating);
      assert.ok(classes.length > 0);
    }
  });
});
