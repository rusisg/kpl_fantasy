import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { generateAutopickSquad } from "../lib/autopick-engine";
import {
  SQUAD_LIMITS,
  validateCaptaincy,
  validateFullSquad,
  validateStartingLineup,
} from "../lib/squad-validation";
import {
  clubSupportersSlug,
  enrollSquadInSystemLeagues,
  fetchUserLeaguesWithStandings,
  OVERALL_LEAGUE_SLUG,
  seedSystemLeagues,
} from "../lib/system-leagues";
import { formatLeagueDisplayName, translate } from "../lib/i18n";
import { Position } from "../lib/types";

interface TestManagerSpec {
  key: string;
  email: string;
  managerName: string;
  teamName: string;
  clubShortName: "KAI" | "AST" | "AKT";
  simulatedTotalPoints: number;
  simulatedGwPoints: number;
}

const TEST_MANAGERS: TestManagerSpec[] = [
  {
    key: "kairat",
    email: "e2e_kairat_manager@kplfantasy.test",
    managerName: "Айбек Жұмаділов (KAI)",
    teamName: "Almaty Eagles XI",
    clubShortName: "KAI",
    simulatedTotalPoints: 142,
    simulatedGwPoints: 68,
  },
  {
    key: "astana",
    email: "e2e_astana_manager@kplfantasy.test",
    managerName: "Данияр Серіков (AST)",
    teamName: "Astana Nomad FC",
    clubShortName: "AST",
    simulatedTotalPoints: 165,
    simulatedGwPoints: 79,
  },
  {
    key: "aktobe",
    email: "e2e_aktobe_manager@kplfantasy.test",
    managerName: "Ерлан Оспанов (AKT)",
    teamName: "Aktobe Red-Whites",
    clubShortName: "AKT",
    simulatedTotalPoints: 128,
    simulatedGwPoints: 54,
  },
];

async function runUserFlowVerification() {
  console.log("==============================================================");
  console.log("🚀 KPL Fantasy — End-to-End Multi-User League Flow Verification");
  console.log("==============================================================\n");

  const createdUserIds: string[] = [];

  try {
    // 1. Seed & verify system leagues idempotently
    console.log("1️⃣  Seeding & verifying System Leagues...");
    const seedRes1 = await seedSystemLeagues(prisma);
    const seedRes2 = await seedSystemLeagues(prisma); // Run twice to assert idempotency
    assert.equal(
      seedRes1.totalSystemLeagues,
      seedRes2.totalSystemLeagues,
      "System leagues count must remain identical across repeated seed runs"
    );
    assert.equal(seedRes1.overallLeague.slug, OVERALL_LEAGUE_SLUG);
    assert.ok(
      seedRes1.clubLeagues.length >= 14,
      `Expected at least 14 Club Supporters Leagues, found ${seedRes1.clubLeagues.length}`
    );
    console.log(
      `   ✔ Verified ${seedRes1.totalSystemLeagues} System Leagues (1 "${OVERALL_LEAGUE_SLUG}" + ${seedRes1.clubLeagues.length} Club Supporters Leagues)`
    );

    // Verify trilingual localization for Overall Kazakhstan and Club Leagues
    const tEn = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
      translate("en", k, v);
    const tRu = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
      translate("ru", k, v);
    const tKk = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
      translate("kk", k, v);

    assert.equal(formatLeagueDisplayName(seedRes1.overallLeague, tEn), "Overall Kazakhstan");
    assert.equal(formatLeagueDisplayName(seedRes1.overallLeague, tRu), "Общий Казахстан");
    assert.equal(formatLeagueDisplayName(seedRes1.overallLeague, tKk), "Жалпы Қазақстан");
    console.log(
      `   ✔ Verified trilingual names: EN="Overall Kazakhstan" | RU="Общий Казахстан" | KK="Жалпы Қазақстан"\n`
    );

    // Clean any leftover test users from prior interrupted runs
    await prisma.user.deleteMany({
      where: { email: { in: TEST_MANAGERS.map((m) => m.email) } },
    });

    // 2. Create 3 distinct managers with favorite clubs (KAI, AST, AKT), complete onboarding & save valid 15-man squads
    console.log("2️⃣  Onboarding 3 test managers & drafting valid 15-man squads...");
    const onboardedManagers: {
      spec: TestManagerSpec;
      userId: string;
      squadId: string;
      clubId: string;
    }[] = [];

    for (const spec of TEST_MANAGERS) {
      const club = await prisma.club.findUnique({
        where: { shortName: spec.clubShortName },
      });
      assert.ok(club, `Club ${spec.clubShortName} must exist in database`);

      const user = await prisma.user.create({
        data: {
          email: spec.email,
          name: spec.managerName,
          favoriteClubId: club.id,
        },
      });
      createdUserIds.push(user.id);

      const autoPicked = await generateAutopickSquad(club.id, "BALANCED", true);
      assert.equal(autoPicked.length, 15, "Autopick must return 15 players");

      // Fetch DB player records to run full squad validation
      const dbPlayers = await prisma.player.findMany({
        where: { id: { in: autoPicked.map((p) => p.playerId) } },
      });
      const dbById = new Map(dbPlayers.map((p) => [p.id, p]));

      const validationInput = autoPicked.map((p) => {
        const dbP = dbById.get(p.playerId)!;
        return {
          id: p.playerId,
          position: dbP.position as Position,
          price: p.price,
          clubId: dbP.clubId,
          positionOrder: p.positionOrder,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
        };
      });

      const fullValidation = validateFullSquad(validationInput);
      assert.equal(fullValidation.isValid, true, `Squad for ${spec.teamName} must be valid`);

      const startingXI = validationInput.filter((p) => p.positionOrder <= 11);
      const lineupValidation = validateStartingLineup(startingXI);
      assert.equal(lineupValidation.isValid, true, `Starting XI for ${spec.teamName} must be valid`);

      const captain = startingXI.find((p) => p.isCaptain)!;
      const viceCaptain = startingXI.find((p) => p.isViceCaptain)!;
      const capValidation = validateCaptaincy(startingXI, captain.id, viceCaptain.id);
      assert.equal(capValidation.isValid, true, `Captaincy for ${spec.teamName} must be valid`);

      const spentTenths = autoPicked.reduce(
        (sum, p) => sum + Math.round(p.price * 10),
        0
      );
      const remainingBudget = Number(
        ((Math.round(SQUAD_LIMITS.MAX_BUDGET * 10) - spentTenths) / 10).toFixed(1)
      );

      const squad = await prisma.$transaction(async (tx) => {
        const sq = await tx.squad.create({
          data: {
            userId: user.id,
            name: spec.teamName,
            budget: remainingBudget,
            totalPoints: spec.simulatedTotalPoints,
          },
        });

        await tx.squadPlayer.createMany({
          data: autoPicked.map((p) => ({
            squadId: sq.id,
            playerId: p.playerId,
            purchasePrice: p.price,
            positionOrder: p.positionOrder,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
          })),
        });

        // Execute auto-enrollment 3 times in a row to verify strict idempotency
        await enrollSquadInSystemLeagues(tx, {
          userId: user.id,
          squadId: sq.id,
          favoriteClubId: club.id,
        });
        await enrollSquadInSystemLeagues(tx, {
          userId: user.id,
          squadId: sq.id,
          favoriteClubId: club.id,
        });
        await enrollSquadInSystemLeagues(tx, {
          userId: user.id,
          squadId: sq.id,
          favoriteClubId: club.id,
        });

        return sq;
      });

      onboardedManagers.push({
        spec,
        userId: user.id,
        squadId: squad.id,
        clubId: club.id,
      });

      console.log(
        `   ✔ Drafted & saved 15-man squad "${spec.teamName}" (${spec.clubShortName}) — Budget left: £${remainingBudget.toFixed(1)}m, Points: ${spec.simulatedTotalPoints}`
      );
    }

    // 3. Verify all 3 managers are auto-enrolled in "Overall Kazakhstan" (`slug: "overall"`)
    console.log("\n3️⃣  Verifying auto-enrollment in 'Overall Kazakhstan' (`slug: \"overall\"`)...");
    const overallLeague = await prisma.league.findUnique({
      where: { slug: OVERALL_LEAGUE_SLUG },
      include: { members: true },
    });
    if (!overallLeague) {
      throw new Error("Overall Kazakhstan league must exist");
    }

    for (const mgr of onboardedManagers) {
      const memberCount: number = overallLeague.members.filter(
        (m) => m.squadId === mgr.squadId
      ).length;
      assert.equal(
        memberCount,
        1,
        `Manager ${mgr.spec.teamName} must have exactly 1 membership in Overall Kazakhstan`
      );
      console.log(
        `   ✔ ${mgr.spec.teamName} is enrolled in Overall Kazakhstan (0 duplicates)`
      );
    }

    // 4. Verify each manager is enrolled in their respective Club Supporters League and NOT in rival club leagues
    console.log("\n4️⃣  Verifying Club Supporters League isolation (enrolled in own club, NOT in rivals)...");
    for (const mgr of onboardedManagers) {
      const ownSlug = clubSupportersSlug(mgr.spec.clubShortName);
      const ownClubLeague = await prisma.league.findUnique({
        where: { slug: ownSlug },
        include: { members: true },
      });
      if (!ownClubLeague) {
        throw new Error(`Club league ${ownSlug} must exist`);
      }

      const ownMembershipCount: number = ownClubLeague.members.filter(
        (m) => m.squadId === mgr.squadId
      ).length;
      assert.equal(
        ownMembershipCount,
        1,
        `${mgr.spec.teamName} must be enrolled exactly once in ${ownSlug}`
      );

      // Check rival club leagues
      for (const rival of onboardedManagers) {
        if (rival.spec.clubShortName === mgr.spec.clubShortName) continue;
        const rivalSlug = clubSupportersSlug(rival.spec.clubShortName);
        const rivalLeague = await prisma.league.findUnique({
          where: { slug: rivalSlug },
          include: { members: true },
        });
        if (!rivalLeague) {
          throw new Error(`Rival league ${rivalSlug} must exist`);
        }
        const inRival = rivalLeague.members.some((m) => m.squadId === mgr.squadId);
        assert.equal(
          inRival,
          false,
          `${mgr.spec.teamName} (${mgr.spec.clubShortName}) must NOT be enrolled in rival league ${rivalSlug}`
        );
      }

      console.log(
        `   ✔ ${mgr.spec.teamName} is enrolled in "${ownSlug}" and excluded from rival club leagues`
      );
    }

    // 5. Verify Leaderboard sorting by points, rank calculation, and current-user highlighting
    console.log("\n5️⃣  Verifying leaderboard sorting, rank calculation & API response...");
    const astanaMgr = onboardedManagers.find((m) => m.spec.clubShortName === "AST")!;
    const leaguesForAstana = await fetchUserLeaguesWithStandings(
      prisma,
      astanaMgr.userId,
      astanaMgr.clubId
    );

    const overallSummary = leaguesForAstana.find(
      (l) => l.slug === OVERALL_LEAGUE_SLUG
    );
    assert.ok(overallSummary, "Overall Kazakhstan summary must be returned first");
    assert.equal(leaguesForAstana[0].slug, OVERALL_LEAGUE_SLUG);

    // Check descending points order across all standings in Overall Kazakhstan
    for (let i = 1; i < overallSummary.standings.length; i++) {
      const prev = overallSummary.standings[i - 1];
      const curr = overallSummary.standings[i];
      assert.ok(
        prev.totalPoints >= curr.totalPoints,
        `Standings must be sorted descending by totalPoints (${prev.totalPoints} < ${curr.totalPoints})`
      );
      assert.ok(
        curr.rank >= prev.rank,
        `Ranks must be monotonically non-decreasing (${curr.rank} < ${prev.rank})`
      );
    }

    // Verify relative ordering of our 3 test managers: AST (165) > KAI (142) > AKT (128)
    const rowAst = overallSummary.standings.find(
      (r) => r.squadId === onboardedManagers[1].squadId
    )!;
    const rowKai = overallSummary.standings.find(
      (r) => r.squadId === onboardedManagers[0].squadId
    )!;
    const rowAkt = overallSummary.standings.find(
      (r) => r.squadId === onboardedManagers[2].squadId
    )!;

    assert.ok(rowAst && rowKai && rowAkt, "All 3 test squads must appear in Overall standings");
    assert.ok(
      rowAst.rank < rowKai.rank && rowKai.rank < rowAkt.rank,
      `Expected rank order AST (#${rowAst.rank}) < KAI (#${rowKai.rank}) < AKT (#${rowAkt.rank})`
    );
    assert.equal(rowAst.isCurrentUser, true, "Astana manager row must be marked isCurrentUser=true");
    assert.equal(rowKai.isCurrentUser, false);
    assert.equal(rowAkt.isCurrentUser, false);

    console.log(
      `   ✔ Leaderboard sorted accurately: #${rowAst.rank} ${rowAst.teamName} (${rowAst.totalPoints} pts) > #${rowKai.rank} ${rowKai.teamName} (${rowKai.totalPoints} pts) > #${rowAkt.rank} ${rowAkt.teamName} (${rowAkt.totalPoints} pts)`
    );

    console.log("\n==============================================================");
    console.log("✅ ALL END-TO-END USER FLOW & LEAGUE ASSERTIONS PASSED!");
    console.log("==============================================================\n");
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.squad.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      console.log("🧹 Cleaned up temporary test managers and squads.");
    }
    await prisma.$disconnect();
  }
}

runUserFlowVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ User flow verification failed:", err);
    process.exit(1);
  });
