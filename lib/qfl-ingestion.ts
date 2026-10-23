import "dotenv/config";
import { Position } from "@prisma/client";
import { prisma } from "./prisma";

export interface QFLClub {
  name: string;
  shortName: string;
  logoUrl?: string;
}

export interface QFLPlayer {
  firstName: string;
  lastName: string;
  clubShortName: string;
  position: Position;
  price: number;
}

export const KPL_CLUBS: QFLClub[] = [
  { name: "FC Kairat", shortName: "KAI" },
  { name: "FC Astana", shortName: "AST" },
  { name: "FC Aktobe", shortName: "AKT" },
  { name: "FC Ordabasy", shortName: "ORD" },
  { name: "FC Tobol", shortName: "TOB" },
  { name: "FC Yelimay", shortName: "ELI" },
  { name: "FC Atyrau", shortName: "ATY" },
  { name: "FC Kaisar", shortName: "KSR" },
  { name: "FC Kyzylzhar", shortName: "KYZ" },
  { name: "FK Zhenis", shortName: "ZHN" },
  { name: "FC Zhetysu", shortName: "ZHT" },
  { name: "FC Okzhetpes", shortName: "OKZ" },
  { name: "FK Ulytau", shortName: "ULY" },
  { name: "FK Kaspiy", shortName: "KAS" },
];

export const INITIAL_ROSTER: QFLPlayer[] = [
  // Kairat
  { firstName: "Joao", lastName: "Paulo", clubShortName: "KAI", position: Position.FWD, price: 10.5 },
  { firstName: "Giorgi", lastName: "Zaria", clubShortName: "KAI", position: Position.MID, price: 8.5 },
  { firstName: "Alyaksandr", lastName: "Martynovich", clubShortName: "KAI", position: Position.DEF, price: 6.0 },
  { firstName: "Dan", lastName: "Glazer", clubShortName: "KAI", position: Position.MID, price: 7.0 },
  { firstName: "Vadim", lastName: "Ulyanov", clubShortName: "KAI", position: Position.GK, price: 5.0 },

  // Astana
  { firstName: "Marin", lastName: "Tomasov", clubShortName: "AST", position: Position.MID, price: 10.0 },
  { firstName: "Nazmi", lastName: "Gripshi", clubShortName: "AST", position: Position.MID, price: 8.0 },
  { firstName: "Yan", lastName: "Vorogovskiy", clubShortName: "AST", position: Position.DEF, price: 6.5 },
  { firstName: "Josip", lastName: "Condric", clubShortName: "AST", position: Position.GK, price: 5.5 },
  { firstName: "Geoffrey", lastName: "Chinedu", clubShortName: "AST", position: Position.FWD, price: 9.0 },

  // Aktobe
  { firstName: "Idris", lastName: "Umayev", clubShortName: "AKT", position: Position.FWD, price: 8.5 },
  { firstName: "Igor", lastName: "Shatskiy", clubShortName: "AKT", position: Position.GK, price: 5.5 },
  { firstName: "Gabi", lastName: "Kiki", clubShortName: "AKT", position: Position.DEF, price: 6.0 },
  { firstName: "Bogdan", lastName: "Vatajelu", clubShortName: "AKT", position: Position.DEF, price: 5.5 },

  // Tobol
  { firstName: "Islam", lastName: "Chesnokov", clubShortName: "TOB", position: Position.MID, price: 9.5 },
  { firstName: "Askhat", lastName: "Tagybergen", clubShortName: "TOB", position: Position.MID, price: 8.5 },
  { firstName: "Stas", lastName: "Pokatilov", clubShortName: "TOB", position: Position.GK, price: 5.0 },
  { firstName: "Nikolay", lastName: "Signevich", clubShortName: "TOB", position: Position.FWD, price: 9.0 },

  // Ordabasy
  { firstName: "Jasurbek", lastName: "Yakhshiboev", clubShortName: "ORD", position: Position.MID, price: 9.0 },
  { firstName: "Serhiy", lastName: "Maliy", clubShortName: "ORD", position: Position.DEF, price: 5.5 },
  { firstName: "Shokhboz", lastName: "Umarov", clubShortName: "ORD", position: Position.MID, price: 7.5 },
  { firstName: "Baurzhan", lastName: "Islamkhan", clubShortName: "ORD", position: Position.MID, price: 7.0 },
];

export async function seedQFLDatabase() {
  console.log("Starting QFL database seeding...");

  // 1. Upsert Clubs
  const clubMap = new Map<string, string>();
  for (const c of KPL_CLUBS) {
    const club = await prisma.club.upsert({
      where: { shortName: c.shortName },
      update: { name: c.name, logoUrl: c.logoUrl },
      create: { name: c.name, shortName: c.shortName, logoUrl: c.logoUrl },
    });
    clubMap.set(c.shortName, club.id);
  }

  // 2. Upsert Players deterministically on composite (clubId, firstName, lastName)
  for (const p of INITIAL_ROSTER) {
    const clubId = clubMap.get(p.clubShortName);
    if (!clubId) continue;

    await prisma.player.upsert({
      where: {
        clubId_firstName_lastName: {
          clubId,
          firstName: p.firstName,
          lastName: p.lastName,
        },
      },
      update: {
        position: p.position,
        price: p.price,
      },
      create: {
        firstName: p.firstName,
        lastName: p.lastName,
        clubId,
        position: p.position,
        price: p.price,
      },
    });
  }

  // 3. Create Default Gameweek 1 if empty
  const gwCount = await prisma.gameweek.count();
  if (gwCount === 0) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 5);

    await prisma.gameweek.create({
      data: {
        id: 1,
        deadline,
        isCurrent: true,
        isFinished: false,
      },
    });
  }

  console.log("QFL seeding completed successfully!");
}
