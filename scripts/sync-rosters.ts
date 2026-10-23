import "dotenv/config";
import * as cheerio from "cheerio";
import { Position } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { resolveClubShortName } from "../lib/clubs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const BASE_URL = "https://www.transfermarkt.com";
const KPL_COMPETITION_URL = `${BASE_URL}/premier-liga/startseite/wettbewerb/KAS1`;

interface ScrapedPlayerRecord {
  externalId: string;
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
}

// Map Transfermarkt positions to Prisma Enums
function mapPosition(tmPosition: string): Position {
  const p = tmPosition.toLowerCase();
  if (p.includes("goalkeeper")) return Position.GK;
  if (p.includes("back") || p.includes("defender")) return Position.DEF;
  if (p.includes("midfield")) return Position.MID;
  if (p.includes("wing") || p.includes("forward") || p.includes("striker")) {
    return Position.FWD;
  }
  return Position.MID;
}

// Convert real-world Market Value (e.g. "€1.20m") to a valid Fantasy Budget Price (4.0 - 15.0 in 0.5 steps)
function parsePrice(tmValue: string): number {
  if (!tmValue || tmValue.trim() === "-" || tmValue.trim() === "") return 4.0;
  const num = parseFloat(tmValue.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return 4.0;

  let raw = 4.0;
  if (tmValue.includes("m")) {
    raw = Math.min(15.0, Math.max(4.5, num * 4.5));
  } else if (tmValue.includes("k")) {
    raw = Math.max(4.0, (num / 1000) * 4.5);
  }
  return Math.round(raw * 2) / 2;
}

/**
 * Extracts a stable external player identifier from Transfermarkt's href (`/spieler/123456`)
 * or falls back to a deterministic slug keyed by `(shortName, fullName)`.
 */
function buildDeterministicExternalId(
  playerHref: string | undefined,
  clubShortName: string,
  fullName: string
): string {
  const match = playerHref?.match(/\/spieler\/(\d+)/);
  if (match?.[1]) {
    return `tm-${match[1]}`;
  }
  const normalizedSlug = fullName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `tm-${clubShortName.toLowerCase()}-${normalizedSlug || "player"}`;
}

export async function scrapeAndSeedQFL() {
  console.log("[Scraper] Booting up stealth headless browser...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    console.log(`[Scraper] Navigating to ${KPL_COMPETITION_URL}...`);

    await page.goto(KPL_COMPETITION_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await delay(3000);

    const compHtml = await page.content();
    const $ = cheerio.load(compHtml);

    const clubsToScrape: { name: string; url: string }[] = [];

    $("table.items tbody tr").each((_, row) => {
      const $row = $(row);
      const nameAnchor = $row.find("td.hauptlink a").first();

      if (nameAnchor.length > 0) {
        const clubName = nameAnchor.text().trim();
        const clubUrl = nameAnchor.attr("href");
        if (
          clubName &&
          clubUrl &&
          !clubsToScrape.find((c) => c.name === clubName)
        ) {
          clubsToScrape.push({ name: clubName, url: `${BASE_URL}${clubUrl}` });
        }
      }
    });

    console.log(
      `[Scraper] Found ${clubsToScrape.length} clubs. Beginning roster extraction...`
    );

    const usedClubCodes = new Set<string>();
    let totalPlayers = 0;

    for (const clubInfo of clubsToScrape) {
      console.log(`[Scraper] Fetching roster for ${clubInfo.name}...`);

      const shortName = resolveClubShortName(clubInfo.name, usedClubCodes);
      const club = await prisma.club.upsert({
        where: { shortName },
        update: { name: clubInfo.name },
        create: { name: clubInfo.name, shortName },
      });

      await page.goto(clubInfo.url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await delay(2000);

      const clubHtml = await page.content();
      const $club = cheerio.load(clubHtml);

      const playersByExternalId = new Map<string, ScrapedPlayerRecord>();

      $club("table.items tbody tr.odd, table.items tbody tr.even").each(
        (_, row) => {
          const $row = $club(row);

          const nameNode = $row.find("td.hauptlink a").first();
          const fullName = nameNode.text().trim();
          const playerHref = nameNode.attr("href");

          if (!fullName) return;

          const nameParts = fullName.split(/\s+/);
          const lastName =
            nameParts.length > 1 ? nameParts.slice(1).join(" ") : fullName;
          const firstName = nameParts.length > 1 ? nameParts[0] : "";

          const positionText =
            $row.find("td[title]").attr("title") ||
            $row.find("table.inline-table tr").eq(1).text().trim() ||
            $row.find("td").eq(4).text().trim();

          const marketValueText = $row.find("td.rechts.hauptlink").text().trim();
          const externalId = buildDeterministicExternalId(
            playerHref,
            shortName,
            fullName
          );

          playersByExternalId.set(externalId, {
            externalId,
            firstName,
            lastName,
            position: mapPosition(positionText),
            price: parsePrice(marketValueText),
          });
        }
      );

      for (const p of playersByExternalId.values()) {
        await prisma.player.upsert({
          where: { externalId: p.externalId },
          update: {
            firstName: p.firstName,
            lastName: p.lastName,
            clubId: club.id,
            position: p.position,
            price: p.price,
          },
          create: {
            externalId: p.externalId,
            firstName: p.firstName,
            lastName: p.lastName,
            clubId: club.id,
            position: p.position,
            price: p.price,
          },
        });
        totalPlayers++;
      }

      console.log(
        `[Scraper] Saved ${playersByExternalId.size} players for ${clubInfo.name} (${shortName}).`
      );
    }

    console.log(
      `[Scraper] Success! Ingested ${totalPlayers} players across ${clubsToScrape.length} clubs.`
    );
    return { success: true, totalPlayers, clubs: clubsToScrape.length };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Scraper] Failed:", message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Execute when invoked directly as an offline CLI script (`npx tsx scripts/sync-rosters.ts`)
if (require.main === module) {
  scrapeAndSeedQFL()
    .catch((err) => {
      console.error("[Scraper CLI] Fatal error:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
