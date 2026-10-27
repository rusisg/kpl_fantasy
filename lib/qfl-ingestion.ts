import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { FixtureStatus, Position } from "@prisma/client";
import { prisma } from "./prisma";
import { KPL_CLUB_CATALOG } from "./clubs";

export interface QFLClub {
  name: string;
  shortName: string;
  logoUrl?: string;
}

export interface QFLPlayer {
  externalId?: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
  position: Position;
  price: number;
  totalPoints?: number;
}

/**
 * Official 16 KPL clubs sourced from https://kffleague.kz
 * (При использовании материалов обязательна ссылка на официальный сайт kffleague.kz).
 */
export const KPL_CLUBS: QFLClub[] = KPL_CLUB_CATALOG.slice(0, 16).map((c) => ({
  name: c.name,
  shortName: c.shortName,
  logoUrl: c.logoUrl,
}));

export const INITIAL_ROSTER: QFLPlayer[] = [
  { firstName: "Берн", lastName: "Йонсен", clubShortName: "ORD", position: Position.FWD, price: 11.0 },
  { firstName: "Эльхан", lastName: "Астанов", clubShortName: "ORD", position: Position.MID, price: 10.0 },
  { firstName: "Сергей", lastName: "Малый", clubShortName: "ORD", position: Position.DEF, price: 7.5 },
  { firstName: "Марк", lastName: "Гуаль", clubShortName: "KAI", position: Position.FWD, price: 10.5 },
  { firstName: "Темирлан", lastName: "Анарбеков", clubShortName: "KAI", position: Position.GK, price: 6.5 },
  { firstName: "Марин", lastName: "Томасов", clubShortName: "AST", position: Position.MID, price: 10.5 },
  { firstName: "Ян", lastName: "Вороговский", clubShortName: "AST", position: Position.DEF, price: 7.0 },
  { firstName: "Артур", lastName: "Шушеначев", clubShortName: "AKT", position: Position.FWD, price: 9.0 },
  { firstName: "Урош", lastName: "Милованович", clubShortName: "TOB", position: Position.FWD, price: 9.5 },
  { firstName: "Роман", lastName: "Муртазаев", clubShortName: "ELI", position: Position.FWD, price: 8.5 },
];

const ROSTER_SNAPSHOT_PATH = path.resolve(
  process.cwd(),
  "prisma/data/kpl-rosters.json"
);

export async function seedQFLDatabase() {
  console.log("Starting QFL database seeding (source: https://kffleague.kz)...");

  if (fs.existsSync(ROSTER_SNAPSHOT_PATH)) {
    const raw = JSON.parse(fs.readFileSync(ROSTER_SNAPSHOT_PATH, "utf8")) as {
      clubs?: {
        name: string;
        shortName: string;
        logoUrl?: string;
        players: {
          externalId: string;
          firstName: string;
          lastName: string;
          position: Position;
          price: number;
          totalPoints?: number;
        }[];
      }[];
      fixtures?: {
        tour: number;
        kickoffTime: string;
        status: FixtureStatus;
        homeClubShortName: string;
        awayClubShortName: string;
        homeScore: number | null;
        awayScore: number | null;
      }[];
    };

    const clubMap = new Map<string, string>();
    for (const c of raw.clubs ?? []) {
      const club = await prisma.club.upsert({
        where: { shortName: c.shortName },
        update: { name: c.name, logoUrl: c.logoUrl },
        create: { name: c.name, shortName: c.shortName, logoUrl: c.logoUrl },
      });
      clubMap.set(c.shortName, club.id);

      for (const p of c.players) {
        await prisma.player.upsert({
          where: { externalId: p.externalId },
          update: {
            firstName: p.firstName,
            lastName: p.lastName,
            clubId: club.id,
            position: p.position,
            price: p.price,
            totalPoints: p.totalPoints ?? 0,
          },
          create: {
            externalId: p.externalId,
            firstName: p.firstName,
            lastName: p.lastName,
            clubId: club.id,
            position: p.position,
            price: p.price,
            totalPoints: p.totalPoints ?? 0,
          },
        });
      }
    }

    console.log("QFL seeding from kpl-rosters.json completed successfully!");
    return;
  }

  // Fallback if snapshot does not exist
  const clubMap = new Map<string, string>();
  for (const c of KPL_CLUBS) {
    const club = await prisma.club.upsert({
      where: { shortName: c.shortName },
      update: { name: c.name, logoUrl: c.logoUrl },
      create: { name: c.name, shortName: c.shortName, logoUrl: c.logoUrl },
    });
    clubMap.set(c.shortName, club.id);
  }

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

  console.log("QFL fallback seeding completed successfully!");
}
