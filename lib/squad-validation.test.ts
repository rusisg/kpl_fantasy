import { test } from "node:test";
import assert from "node:assert/strict";
import { Position } from "@prisma/client";
import {
  validateFullSquad,
  validateStartingLineup,
  validateCaptaincy,
  SquadPlayerInput,
} from "./squad-validation.js";

function createMockSquad(): SquadPlayerInput[] {
  const squad: SquadPlayerInput[] = [];

  // 2 Goalkeepers
  squad.push({ id: "p1", position: Position.GK, price: 5.0, clubId: "club1" });
  squad.push({ id: "p2", position: Position.GK, price: 4.5, clubId: "club2" });

  // 5 Defenders
  for (let i = 3; i <= 7; i++) {
    squad.push({ id: `p${i}`, position: Position.DEF, price: 5.0, clubId: `club${i}` });
  }

  // 5 Midfielders
  for (let i = 8; i <= 12; i++) {
    squad.push({ id: `p${i}`, position: Position.MID, price: 7.0, clubId: `club${i}` });
  }

  // 3 Forwards
  squad.push({ id: "p13", position: Position.FWD, price: 8.0, clubId: "club13" });
  squad.push({ id: "p14", position: Position.FWD, price: 9.0, clubId: "club14" });
  squad.push({ id: "p15", position: Position.FWD, price: 10.0, clubId: "club15" });

  return squad;
}

test("validateFullSquad - should pass for a valid 15-player squad within budget", () => {
  const squad = createMockSquad();
  const result = validateFullSquad(squad);
  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
});

test("validateFullSquad - should fail when total budget exceeds 100M", () => {
  const squad = createMockSquad();
  squad[0].price = 25.0;
  const result = validateFullSquad(squad);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "budget"));
});

test("validateFullSquad - should fail when more than 3 players are from the same club", () => {
  const squad = createMockSquad();
  // Assign 4 players to the same club ID
  squad[0].clubId = "club_overloaded";
  squad[1].clubId = "club_overloaded";
  squad[2].clubId = "club_overloaded";
  squad[3].clubId = "club_overloaded";

  const result = validateFullSquad(squad);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "club"));
});

test("validateStartingLineup - should pass for valid 4-4-2 formation", () => {
  const squad = createMockSquad();
  const startingXI = [
    squad[0],
    squad[2], squad[3], squad[4], squad[5],
    squad[7], squad[8], squad[9], squad[10],
    squad[12], squad[13],
  ];
  const result = validateStartingLineup(startingXI);
  assert.equal(result.isValid, true);
});

test("validateStartingLineup - should fail for invalid formation (2 GK)", () => {
  const squad = createMockSquad();
  const startingXI = [
    squad[0], squad[1],
    squad[2], squad[3], squad[4], squad[5],
    squad[7], squad[8], squad[9], squad[10], squad[11],
  ];
  const result = validateStartingLineup(startingXI);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "formation"));
});