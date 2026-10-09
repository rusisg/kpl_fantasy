import "dotenv/config";
import { PrismaClient, Position } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CLUBS = [
  { name: "FC Astana", shortName: "AST" },
  { name: "FC Kairat", shortName: "KAI" },
  { name: "Tobol Kostanay", shortName: "TOB" },
  { name: "FC Ordabasy", shortName: "ORD" },
  { name: "FC Aktobe", shortName: "AKT" },
  { name: "Kyzylzhar SK", shortName: "KYZ" },
  { name: "Kaisar Kyzylorda", shortName: "KSR" },
  { name: "FC Shakhter Karagandy", shortName: "SHA" },
  { name: "FC Zhetysu", shortName: "ZHE" },
  { name: "FC Atyrau", shortName: "ATY" },
  { name: "FC Elimai", shortName: "ELI" },
  { name: "FC Turan", shortName: "TUR" },
  { name: "FC Zhenis", shortName: "ZHN" },
  { name: "FC Okzhetpes", shortName: "OKZ" },
];

const SAMPLE_PLAYERS_PER_CLUB: { firstName: string; lastName: string; position: Position; price: number }[] = [
  // Goalkeepers
  { firstName: "Aleksandr", lastName: "Mokin", position: Position.GK, price: 5.0 },
  { firstName: "Stas", lastName: "Pokatilov", position: Position.GK, price: 4.5 },
  // Defenders
  { firstName: "Serhiy", lastName: "Malyi", position: Position.DEF, price: 5.5 },
  { firstName: "Gafurzhan", lastName: "Suyumbayev", position: Position.DEF, price: 5.0 },
  { firstName: "Nuraly", lastName: "Alip", position: Position.DEF, price: 6.0 },
  { firstName: "Temirlan", lastName: "Yerslanov", position: Position.DEF, price: 4.5 },
  { firstName: "Yan", lastName: "Vorogovsky", position: Position.DEF, price: 5.5 },
  // Midfielders
  { firstName: "Bauyrzhan", lastName: "Islamkhan", position: Position.MID, price: 8.5 },
  { firstName: "Askhat", lastName: "Tagybergen", position: Position.MID, price: 9.0 },
  { firstName: "Ramazan", lastName: "Orazov", position: Position.MID, price: 7.5 },
  { firstName: "Maxeb", lastName: "Ebong", position: Position.MID, price: 7.0 },
  { firstName: "Elkhan", lastName: "Astanov", position: Position.MID, price: 6.5 },
  // Forwards
  { firstName: "Abat", lastName: "Aymbetov", position: Position.FWD, price: 10.0 },
  { firstName: "João", lastName: "Paulo", position: Position.FWD, price: 11.5 },
  { firstName: "Artur", lastName: "Shushenachev", position: Position.FWD, price: 8.0 },
];

async function main() {
  console.log("🌱 Starting KPL Fantasy database seeding...");

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

  // 2. Seed Gameweeks (38 weeks)
  const startDate = new Date();
  const gameweeks = [];
  for (let i = 1; i <= 38; i++) {
    const deadline = new Date(startDate.getTime() + (i - 1) * 7 * 24 * 60 * 60 * 1000);
    gameweeks.push({
      id: i,
      deadline,
      isCurrent: i === 1,
      isFinished: false,
    });
  }
  await prisma.gameweek.createMany({ data: gameweeks });
  console.log("✅ Seeded 38 Gameweeks.");

  // 3. Seed Clubs & Players
  let totalPlayersCreated = 0;
  for (const clubData of CLUBS) {
    const club = await prisma.club.create({
      data: {
        name: clubData.name,
        shortName: clubData.shortName,
      },
    });

    const playerRecords = SAMPLE_PLAYERS_PER_CLUB.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      price: p.price,
      clubId: club.id,
      totalPoints: 0,
    }));

    await prisma.player.createMany({ data: playerRecords });
    totalPlayersCreated += playerRecords.length;
  }

  console.log(`✅ Seeded ${CLUBS.length} KPL Clubs and ${totalPlayersCreated} Players.`);
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