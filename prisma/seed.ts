import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { FixtureStatus, PrismaClient, Position } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { generateDoubleRoundRobin, totalRoundsFor } from "../lib/fixture-scheduler";
import { KPL_CLUB_CATALOG } from "../lib/clubs";

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ROSTER_SNAPSHOT_PATH = path.resolve(
  process.cwd(),
  "prisma/data/kpl-rosters.json"
);

interface SnapshotPlayer {
  externalId: string;
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
  totalPoints?: number;
}

interface SnapshotClub {
  kffTeamId?: number;
  name: string;
  shortName: string;
  logoUrl?: string;
  players: SnapshotPlayer[];
}

interface SnapshotFixture {
  externalId?: string;
  tour: number;
  date: string;
  time: string;
  kickoffTime: string;
  status: FixtureStatus;
  homeClubShortName: string;
  awayClubShortName: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface RosterSnapshotFile {
  generatedAt?: string;
  source?: string;
  attribution?: string;
  clubs: SnapshotClub[];
  fixtures?: SnapshotFixture[];
}

const FALLBACK_CLUBS = KPL_CLUB_CATALOG.slice(0, 16).map((c) => ({
  name: c.name,
  shortName: c.shortName,
  logoUrl: c.logoUrl,
}));

const SAMPLE_PLAYERS_PER_CLUB: {
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
}[] = [
  { firstName: "Темирлан", lastName: "Анарбеков", position: Position.GK, price: 5.0 },
  { firstName: "Данил", lastName: "Устименко", position: Position.GK, price: 4.5 },
  { firstName: "Сергей", lastName: "Малый", position: Position.DEF, price: 5.5 },
  { firstName: "Ян", lastName: "Вороговский", position: Position.DEF, price: 5.5 },
  { firstName: "Александр", lastName: "Марочкин", position: Position.DEF, price: 5.0 },
  { firstName: "Султанбек", lastName: "Астанов", position: Position.DEF, price: 5.0 },
  { firstName: "Еркин", lastName: "Тапалов", position: Position.DEF, price: 5.0 },
  { firstName: "Марин", lastName: "Томасов", position: Position.MID, price: 9.5 },
  { firstName: "Эльхан", lastName: "Астанов", position: Position.MID, price: 9.0 },
  { firstName: "Асхат", lastName: "Тагыберген", position: Position.MID, price: 8.0 },
  { firstName: "Бауыржан", lastName: "Исламхан", position: Position.MID, price: 7.5 },
  { firstName: "Ислам", lastName: "Чесноков", position: Position.MID, price: 8.5 },
  { firstName: "Берн", lastName: "Йонсен", position: Position.FWD, price: 10.5 },
  { firstName: "Марк", lastName: "Гуаль", position: Position.FWD, price: 10.0 },
  { firstName: "Артур", lastName: "Шушеначев", position: Position.FWD, price: 8.5 },
];

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error(
      "Refusing to run destructive seed in production without --force flag."
    );
  }

  console.log("🌱 Starting KPL Fantasy database seeding (source: kffleague.kz)...");

  // 1. Clean existing records
  await prisma.playerPerformance.deleteMany();
  await prisma.squadSnapshotPlayer.deleteMany();
  await prisma.squadSnapshot.deleteMany();
  await prisma.squadPlayer.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.fixture.deleteMany();
  await prisma.playerPriceHistory.deleteMany();
  await prisma.player.deleteMany();
  await prisma.club.deleteMany();
  await prisma.gameweek.deleteMany();

  console.log("🧹 Cleaned existing database records.");

  // 2. Load real scraped roster & fixture snapshot from prisma/data/kpl-rosters.json
  let seedClubs: SnapshotClub[] = [];
  let seedFixtures: SnapshotFixture[] = [];

  if (fs.existsSync(ROSTER_SNAPSHOT_PATH)) {
    try {
      const rawJson = fs.readFileSync(ROSTER_SNAPSHOT_PATH, "utf8");
      const parsed = JSON.parse(rawJson) as RosterSnapshotFile;
      if (Array.isArray(parsed.clubs) && parsed.clubs.length > 0) {
        seedClubs = parsed.clubs;
      }
      if (Array.isArray(parsed.fixtures) && parsed.fixtures.length > 0) {
        seedFixtures = parsed.fixtures;
      }
      console.log(
        `📦 Loaded official KFF League snapshot from prisma/data/kpl-rosters.json (${seedClubs.length} clubs, ${seedFixtures.length} fixtures).`
      );
    } catch (err) {
      console.warn(
        "⚠️ Failed to parse prisma/data/kpl-rosters.json, falling back to default clubs:",
        err
      );
    }
  }

  if (seedClubs.length === 0) {
    seedClubs = FALLBACK_CLUBS.map((c) => ({
      name: c.name,
      shortName: c.shortName,
      logoUrl: c.logoUrl,
      players: SAMPLE_PLAYERS_PER_CLUB.map((p) => ({
        externalId: `seed-${c.shortName.toLowerCase()}-${p.lastName.toLowerCase()}`,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        price: p.price,
        totalPoints: 0,
      })),
    }));
  }

  // 3. Seed Clubs & Players
  let totalPlayersCreated = 0;
  const clubIds: string[] = [];
  const clubIdByShortName = new Map<string, string>();

  for (const clubData of seedClubs) {
    const club = await prisma.club.create({
      data: {
        name: clubData.name,
        shortName: clubData.shortName,
        logoUrl: clubData.logoUrl,
      },
    });
    clubIds.push(club.id);
    clubIdByShortName.set(clubData.shortName, club.id);

    const playerRecords = clubData.players.map((p) => ({
      externalId: p.externalId,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      price: p.price,
      clubId: club.id,
      totalPoints: p.totalPoints ?? 0,
    }));

    await prisma.player.createMany({ data: playerRecords });
    totalPlayersCreated += playerRecords.length;
  }

  console.log(
    `✅ Seeded ${seedClubs.length} KPL Clubs and ${totalPlayersCreated} Players.`
  );

  // 4. Seed Gameweeks & Fixtures from official kffleague.kz schedule (or fallback round-robin)
  if (seedFixtures.length > 0) {
    const fixturesByTour = new Map<number, SnapshotFixture[]>();
    for (const f of seedFixtures) {
      const list = fixturesByTour.get(f.tour) ?? [];
      list.push(f);
      fixturesByTour.set(f.tour, list);
    }

    const sortedTours = Array.from(fixturesByTour.keys()).sort((a, b) => a - b);

    // Determine the active/current tour: first tour that has at least one non-finished match,
    // or the final tour if all matches are finished.
    const currentTour =
      sortedTours.find((tour) =>
        (fixturesByTour.get(tour) ?? []).some(
          (f) => f.status !== FixtureStatus.FINISHED
        )
      ) ?? sortedTours[sortedTours.length - 1];

    const nowMs = Date.now();
    const gameweeks = sortedTours.map((tour) => {
      const matches = fixturesByTour.get(tour) ?? [];
      const earliestKickoffMs = Math.min(
        ...matches.map((m) => new Date(m.kickoffTime).getTime())
      );
      const allFinished = matches.every(
        (m) => m.status === FixtureStatus.FINISHED
      );
      const isCurrent = tour === currentTour;

      // Set deadline 90 minutes before the earliest kickoff of the tour.
      // For the active gameweek, ensure the deadline is in the future so squad building is unlocked.
      let deadlineMs = earliestKickoffMs - 90 * 60 * 1000;
      if (isCurrent && deadlineMs <= nowMs) {
        deadlineMs = nowMs + 5 * 24 * 60 * 60 * 1000;
      }

      return {
        id: tour,
        deadline: new Date(deadlineMs),
        isCurrent,
        isFinished: allFinished && !isCurrent,
      };
    });

    await prisma.gameweek.createMany({ data: gameweeks });
    console.log(`✅ Seeded ${gameweeks.length} Official KPL Gameweeks.`);

    const fixtureRecords = [];
    for (const f of seedFixtures) {
      const homeClubId = clubIdByShortName.get(f.homeClubShortName);
      const awayClubId = clubIdByShortName.get(f.awayClubShortName);
      if (!homeClubId || !awayClubId) continue;

      fixtureRecords.push({
        gameweekId: f.tour,
        homeClubId,
        awayClubId,
        kickoffTime: new Date(f.kickoffTime),
        status: f.status,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
      });
    }

    await prisma.fixture.createMany({ data: fixtureRecords });
    console.log(
      `✅ Seeded ${fixtureRecords.length} Official KPL Fixtures & Results from kffleague.kz.`
    );
  } else {
    const totalGameweeks = totalRoundsFor(seedClubs.length);
    const startDate = new Date();
    const gameweeks = [];
    for (let i = 1; i <= totalGameweeks; i++) {
      const deadline = new Date(
        startDate.getTime() + (i - 1) * 7 * 24 * 60 * 60 * 1000
      );
      gameweeks.push({
        id: i,
        deadline,
        isCurrent: i === 1,
        isFinished: false,
      });
    }
    await prisma.gameweek.createMany({ data: gameweeks });
    console.log(`✅ Seeded ${totalGameweeks} Gameweeks.`);

    const deadlineByGameweek = new Map(
      gameweeks.map((gw) => [gw.id, gw.deadline])
    );
    const KICKOFF_OFFSETS_HOURS = [2, 4.5, 7, 26, 28.5, 31, 50];
    const schedule = generateDoubleRoundRobin(seedClubs.length);
    const matchIndexInRound = new Map<number, number>();

    const fixtureRecords = schedule.map((match) => {
      const slot = matchIndexInRound.get(match.round) ?? 0;
      matchIndexInRound.set(match.round, slot + 1);
      const deadline = deadlineByGameweek.get(match.round) as Date;
      const offsetHours =
        KICKOFF_OFFSETS_HOURS[slot % KICKOFF_OFFSETS_HOURS.length];
      return {
        gameweekId: match.round,
        homeClubId: clubIds[match.homeIndex],
        awayClubId: clubIds[match.awayIndex],
        kickoffTime: new Date(deadline.getTime() + offsetHours * 60 * 60 * 1000),
      };
    });

    await prisma.fixture.createMany({ data: fixtureRecords });
    console.log(`✅ Seeded ${fixtureRecords.length} Fixtures.`);
  }

  console.log("🚀 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
