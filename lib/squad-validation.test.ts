import { test } from "node:test";
import assert from "node:assert/strict";
import { Position } from "./types.js";
import {
  validateFullSquad,
  validateStartingLineup,
  validateCaptaincy,
  SquadPlayerInput,
  SelectedSquadPlayerInput,
} from "./squad-validation.js";
import { solveAutopickSquad, AutopickCandidate } from "./autopick-engine.js";
import { resolveClubShortName } from "./clubs.js";

function createMockSquad(): SquadPlayerInput[] {
  const squad: SquadPlayerInput[] = [];

  // 2 Goalkeepers
  squad.push({ id: "p1", position: Position.GK, price: 5.0, clubId: "club1" });
  squad.push({ id: "p2", position: Position.GK, price: 4.5, clubId: "club2" });

  // 5 Defenders
  for (let i = 3; i <= 7; i++) {
    squad.push({
      id: `p${i}`,
      position: Position.DEF,
      price: 5.0,
      clubId: `club${i}`,
    });
  }

  // 5 Midfielders
  for (let i = 8; i <= 12; i++) {
    squad.push({
      id: `p${i}`,
      position: Position.MID,
      price: 7.0,
      clubId: `club${i}`,
    });
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
    squad[2],
    squad[3],
    squad[4],
    squad[5],
    squad[7],
    squad[8],
    squad[9],
    squad[10],
    squad[12],
    squad[13],
  ];
  const result = validateStartingLineup(startingXI);
  assert.equal(result.isValid, true);
});

test("validateStartingLineup - should fail for invalid formation (2 GK)", () => {
  const squad = createMockSquad();
  const startingXI = [
    squad[0],
    squad[1],
    squad[2],
    squad[3],
    squad[4],
    squad[5],
    squad[7],
    squad[8],
    squad[9],
    squad[10],
    squad[11],
  ];
  const result = validateStartingLineup(startingXI);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.field === "formation"));
});

test("validateCaptaincy - should require distinct Captain and Vice-Captain in starting XI", () => {
  const squad = createMockSquad();
  const startingXI: SelectedSquadPlayerInput[] = squad.slice(0, 11).map((p, idx) => ({
    ...p,
    positionOrder: idx + 1,
  }));

  const valid = validateCaptaincy(startingXI, startingXI[0].id, startingXI[1].id);
  assert.equal(valid.isValid, true);

  const duplicate = validateCaptaincy(startingXI, startingXI[0].id, startingXI[0].id);
  assert.equal(duplicate.isValid, false);

  const benchPlayer = validateCaptaincy(startingXI, "p15", startingXI[1].id);
  assert.equal(benchPlayer.isValid, false);
});

test("solveAutopickSquad - selects a valid 15-man squad (2 GK, 5 DEF, 5 MID, 3 FWD) within 100M for BALANCED and PREMIUM_ATTACK", () => {
  const clubs = Array.from({ length: 14 }, (_, i) => `club_${i + 1}`);
  const samplePerClub: { name: string; position: Position; price: number }[] = [
    { name: "Mokin", position: Position.GK, price: 5.0 },
    { name: "Pokatilov", position: Position.GK, price: 4.5 },
    { name: "Malyi", position: Position.DEF, price: 5.5 },
    { name: "Suyumbayev", position: Position.DEF, price: 5.0 },
    { name: "Alip", position: Position.DEF, price: 6.0 },
    { name: "Yerslanov", position: Position.DEF, price: 4.5 },
    { name: "Vorogovsky", position: Position.DEF, price: 5.5 },
    { name: "Islamkhan", position: Position.MID, price: 8.5 },
    { name: "Tagybergen", position: Position.MID, price: 9.0 },
    { name: "Orazov", position: Position.MID, price: 7.5 },
    { name: "Ebong", position: Position.MID, price: 7.0 },
    { name: "Astanov", position: Position.MID, price: 6.5 },
    { name: "Aymbetov", position: Position.FWD, price: 10.0 },
    { name: "Paulo", position: Position.FWD, price: 11.5 },
    { name: "Shushenachev", position: Position.FWD, price: 8.0 },
  ];

  const pool: AutopickCandidate[] = clubs.flatMap((clubId) =>
    samplePerClub.map((p) => ({
      id: `${clubId}-${p.name}`,
      clubId,
      position: p.position,
      price: p.price,
    }))
  );

  for (const strategy of ["BALANCED", "PREMIUM_ATTACK"] as const) {
    const picked = solveAutopickSquad(pool, "club_1", strategy, true);
    assert.equal(picked.length, 15, `${strategy} should pick 15 players`);

    const totalCost = picked.reduce((sum, p) => sum + p.price, 0);
    assert.ok(totalCost <= 100.0, `${strategy} total cost ${totalCost} <= 100.0`);

    const favCount = picked.filter((p) => p.clubId === "club_1").length;
    assert.equal(favCount, 3, `${strategy} should maximize 3 favorite-club players`);
  }
});

test("resolveClubShortName - prevents FC prefix and Kairat/Kaisar collisions", () => {
  const used = new Set<string>();
  const kairat = resolveClubShortName("FC Kairat Almaty", used);
  const kaisar = resolveClubShortName("FC Kaisar Kyzylorda", used);
  const zhenis = resolveClubShortName("FK Zhenis", used);
  const zhetysu = resolveClubShortName("FC Zhetysu", used);

  assert.equal(kairat, "KAI");
  assert.equal(kaisar, "KSR");
  assert.equal(zhenis, "ZHN");
  assert.equal(zhetysu, "ZHT");
  assert.notEqual(kairat, kaisar);

  const usedKff = new Set<string>();
  assert.equal(resolveClubShortName("Ордабасы", usedKff), "ORD");
  assert.equal(resolveClubShortName("Кайрат", usedKff), "KAI");
  assert.equal(resolveClubShortName("Кайсар", usedKff), "KSR");
  assert.equal(resolveClubShortName("Иртыш", usedKff), "IRT");
  assert.equal(resolveClubShortName("Алтай", usedKff), "ALT");
});
