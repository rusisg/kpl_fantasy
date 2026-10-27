import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { FixtureStatus, Position } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { resolveClubShortName } from "../lib/clubs";

const execFileAsync = promisify(execFile);

const KFF_SITE_URL = "https://kffleague.kz";
const KFF_API_BASE = `${KFF_SITE_URL}/api/v1`;
const DEFAULT_SEASON_ID = 200; // Премьер-Лига 2026
const ROSTER_SNAPSHOT_PATH = path.resolve(
  process.cwd(),
  "prisma/data/kpl-rosters.json"
);

export interface ScrapedPlayerRecord {
  externalId: string;
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
  totalPoints?: number;
}

export interface ScrapedClubRoster {
  kffTeamId?: number;
  name: string;
  shortName: string;
  logoUrl?: string;
  players: ScrapedPlayerRecord[];
}

export interface ScrapedFixtureRecord {
  externalId: string;
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

interface KffTeamItem {
  id: number;
  team_id: number;
  team_name: string;
  team_logo?: string | null;
}

interface KffTableRow {
  position: number;
  team_id: number;
  team_name: string;
  team_logo?: string | null;
}

interface KffPlayerItem {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  player_type?: string | null;
  top_role?: string | null;
  number?: number | null;
}

interface KffPlayerStatItem {
  player_id: number;
  games_played?: number | null;
  time_on_field_total?: number | null;
  goal?: number | null;
  goal_pass?: number | null;
  dry_match?: number | null;
  save_shot?: number | null;
  save_shot_penalty?: number | null;
  yellow_cards?: number | null;
  red_cards?: number | null;
  owngoal?: number | null;
}

interface KffGameItem {
  id: number;
  date: string;
  time?: string | null;
  tour: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team: {
    id: number;
    name: string;
    logo_url?: string | null;
  };
  away_team: {
    id: number;
    name: string;
    logo_url?: string | null;
  };
}

/**
 * Fetches JSON from kffleague.kz API using system `curl` first (bypasses Cloudflare TLS fingerprinting)
 * with a fallback to native `fetch`.
 */
async function fetchKffJson<T>(endpoint: string): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${KFF_API_BASE}${endpoint}`;
  try {
    const { stdout } = await execFileAsync("curl", [
      "-sL",
      "-H",
      "Accept: application/json",
      url,
    ]);
    return JSON.parse(stdout) as T;
  } catch {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      throw new Error(`KFF API request failed: ${url} (${res.status})`);
    }
    return (await res.json()) as T;
  }
}

function mapKffPosition(
  pos?: string | null,
  playerType?: string | null,
  topRole?: string | null
): Position {
  if (pos === "GK") return Position.GK;
  if (pos === "DEF") return Position.DEF;
  if (pos === "MID") return Position.MID;
  if (pos === "FWD") return Position.FWD;

  const pt = (playerType ?? "").toLowerCase();
  const tr = (topRole ?? "").toUpperCase();
  if (pt.includes("goal") || tr.includes("ВР")) return Position.GK;
  if (
    pt.includes("def") ||
    tr.includes("ЗЩ") ||
    tr.includes("ЦЗ") ||
    tr.includes("ЛЗ") ||
    tr.includes("ПЗ")
  ) {
    return Position.DEF;
  }
  if (
    pt.includes("off") ||
    pt.includes("forw") ||
    tr.includes("НП") ||
    tr.includes("ЦН") ||
    tr.includes("НАП")
  ) {
    return Position.FWD;
  }
  return Position.MID;
}

function calculateSeasonFantasyPoints(
  stat: KffPlayerStatItem | undefined,
  position: Position
): number {
  if (!stat || !stat.games_played) return 0;
  const gp = stat.games_played ?? 0;
  const mins = stat.time_on_field_total ?? 0;
  const avgMins = gp > 0 ? mins / gp : 0;
  const appearancePts = gp * (avgMins >= 60 ? 2 : 1);
  const goals = stat.goal ?? 0;
  const goalPts =
    goals *
    (position === Position.GK || position === Position.DEF
      ? 6
      : position === Position.MID
      ? 5
      : 4);
  const assists = (stat.goal_pass ?? 0) * 3;
  const cleanSheets =
    (stat.dry_match ?? 0) *
    (position === Position.GK || position === Position.DEF
      ? 4
      : position === Position.MID
      ? 1
      : 0);
  const saves =
    position === Position.GK ? Math.floor((stat.save_shot ?? 0) / 3) : 0;
  const penSaves = (stat.save_shot_penalty ?? 0) * 5;
  const yc = (stat.yellow_cards ?? 0) * -1;
  const rc = (stat.red_cards ?? 0) * -3;
  const og = (stat.owngoal ?? 0) * -2;

  return Math.max(
    0,
    appearancePts +
      goalPts +
      assists +
      cleanSheets +
      saves +
      penSaves +
      yc +
      rc +
      og
  );
}

function calculateFantasyPrice(
  stat: KffPlayerStatItem | undefined,
  position: Position,
  teamRank: number
): number {
  let base =
    position === Position.GK || position === Position.DEF ? 4.0 : 4.5;
  if (teamRank <= 3) base += 0.5;
  else if (teamRank <= 6) base += 0.25;

  if (!stat || !stat.games_played) {
    return Math.round(base * 2) / 2;
  }

  const mins = stat.time_on_field_total ?? 0;
  const goals = stat.goal ?? 0;
  const assists = stat.goal_pass ?? 0;
  const cs = stat.dry_match ?? 0;

  const minsBonus = Math.min(1.0, (mins / 2200) * 1.0);
  const attackBonus = goals * 0.35 + assists * 0.2;
  const defBonus =
    position === Position.GK || position === Position.DEF ? cs * 0.15 : 0;

  const maxCap =
    position === Position.GK ? 6.5 : position === Position.DEF ? 7.5 : 12.0;
  const raw = Math.min(
    maxCap,
    Math.max(4.0, base + minsBonus + attackBonus + defBonus)
  );
  return Math.round(raw * 2) / 2;
}

function mapKffFixtureStatus(rawStatus: string): FixtureStatus {
  const s = (rawStatus ?? "").toLowerCase();
  if (s === "finished" || s === "technical_defeat") return FixtureStatus.FINISHED;
  if (s === "live") return FixtureStatus.LIVE;
  if (s === "postponed") return FixtureStatus.POSTPONED;
  if (s === "cancelled" || s === "canceled") return FixtureStatus.CANCELLED;
  return FixtureStatus.SCHEDULED;
}

/**
 * Scrapes official clubs, rosters, player statistics, and full season fixtures/results
 * from https://kffleague.kz (При использовании материалов обязательна ссылка на официальный сайт),
 * syncs them into PostgreSQL, and writes prisma/data/kpl-rosters.json.
 */
export async function scrapeAndSeedQFL(seasonId: number = DEFAULT_SEASON_ID) {
  console.log(
    `[KFF Scraper] Fetching official KPL season ${seasonId} data from ${KFF_SITE_URL}...`
  );

  const [teamsRes, tableRes] = await Promise.all([
    fetchKffJson<{ items: KffTeamItem[] }>(`/seasons/${seasonId}/teams?lang=ru`),
    fetchKffJson<{ table: KffTableRow[] }>(`/seasons/${seasonId}/table?lang=ru`),
  ]);

  const rankByTeamId = new Map<number, number>();
  for (const row of tableRes.table ?? []) {
    rankByTeamId.set(row.team_id, row.position);
  }

  // Fetch all player statistics across pages
  const statsByPlayerId = new Map<number, KffPlayerStatItem>();
  for (let offset = 0; offset <= 500; offset += 100) {
    const page = await fetchKffJson<{ items?: KffPlayerStatItem[] }>(
      `/seasons/${seasonId}/player-stats?sort_by=games_played&limit=100&offset=${offset}&lang=ru`
    );
    const items = page.items ?? [];
    for (const item of items) {
      statsByPlayerId.set(item.player_id, item);
    }
    if (items.length < 100) break;
  }

  console.log(
    `[KFF Scraper] Loaded ${statsByPlayerId.size} player performance records.`
  );

  // Sort teams by current league table standing
  const sortedTeams = [...(teamsRes.items ?? [])].sort(
    (a, b) =>
      (rankByTeamId.get(a.team_id) ?? 99) - (rankByTeamId.get(b.team_id) ?? 99)
  );

  const usedClubCodes = new Set<string>();
  const shortNameByTeamId = new Map<number, string>();
  const clubDbIdByShortName = new Map<string, string>();
  const exportedClubs: ScrapedClubRoster[] = [];
  let totalPlayers = 0;

  for (const team of sortedTeams) {
    const shortName = resolveClubShortName(team.team_name, usedClubCodes);
    shortNameByTeamId.set(team.team_id, shortName);

    const club = await prisma.club.upsert({
      where: { shortName },
      update: {
        name: team.team_name,
        logoUrl: team.team_logo ?? undefined,
      },
      create: {
        name: team.team_name,
        shortName,
        logoUrl: team.team_logo ?? undefined,
      },
    });
    clubDbIdByShortName.set(shortName, club.id);

    const rosterRes = await fetchKffJson<{ items?: KffPlayerItem[] }>(
      `/teams/${team.team_id}/players?season_id=${seasonId}&lang=ru`
    );

    const teamRank = rankByTeamId.get(team.team_id) ?? 10;
    const playersByExternalId = new Map<string, ScrapedPlayerRecord>();

    for (const rawPlayer of rosterRes.items ?? []) {
      const firstName = (rawPlayer.first_name ?? "").trim();
      const lastName = (rawPlayer.last_name ?? "").trim();
      if (!firstName && !lastName) continue;

      const position = mapKffPosition(
        rawPlayer.position,
        rawPlayer.player_type,
        rawPlayer.top_role
      );
      const stat = statsByPlayerId.get(rawPlayer.id);
      const price = calculateFantasyPrice(stat, position, teamRank);
      const totalPoints = calculateSeasonFantasyPoints(stat, position);
      const externalId = `kff-${rawPlayer.id}`;

      playersByExternalId.set(externalId, {
        externalId,
        firstName,
        lastName: lastName || firstName,
        position,
        price,
        totalPoints,
      });
    }

    for (const p of playersByExternalId.values()) {
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
      totalPlayers++;
    }

    exportedClubs.push({
      kffTeamId: team.team_id,
      name: team.team_name,
      shortName,
      logoUrl: team.team_logo ?? undefined,
      players: Array.from(playersByExternalId.values()),
    });

    console.log(
      `[KFF Scraper] Synced ${playersByExternalId.size} players for ${team.team_name} (${shortName}).`
    );
  }

  // Fetch all season matches (finished results + upcoming fixtures)
  const rawGames: KffGameItem[] = [];
  for (let offset = 0; offset <= 400; offset += 100) {
    const gamesPage = await fetchKffJson<{ items?: KffGameItem[]; total?: number }>(
      `/games?season_id=${seasonId}&limit=100&offset=${offset}&lang=ru`
    );
    const items = gamesPage.items ?? [];
    rawGames.push(...items);
    if (items.length < 100) break;
  }

  const exportedFixtures: ScrapedFixtureRecord[] = [];
  for (const g of rawGames) {
    const homeShort =
      shortNameByTeamId.get(g.home_team.id) ??
      resolveClubShortName(g.home_team.name);
    const awayShort =
      shortNameByTeamId.get(g.away_team.id) ??
      resolveClubShortName(g.away_team.name);
    const timeStr = g.time ? g.time.slice(0, 5) : "15:00";
    const kickoffIso = new Date(`${g.date}T${timeStr}:00+05:00`).toISOString();

    exportedFixtures.push({
      externalId: `kff-game-${g.id}`,
      tour: g.tour,
      date: g.date,
      time: timeStr,
      kickoffTime: kickoffIso,
      status: mapKffFixtureStatus(g.status),
      homeClubShortName: homeShort,
      awayClubShortName: awayShort,
      homeScore: g.home_score,
      awayScore: g.away_score,
    });
  }

  exportedFixtures.sort(
    (a, b) => a.tour - b.tour || a.kickoffTime.localeCompare(b.kickoffTime)
  );

  if (exportedClubs.length > 0) {
    await mkdir(path.dirname(ROSTER_SNAPSHOT_PATH), { recursive: true });
    await writeFile(
      ROSTER_SNAPSHOT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: KFF_SITE_URL,
          attribution:
            "При использовании материалов обязательна ссылка на официальный сайт kffleague.kz",
          seasonId,
          seasonName: "Премьер-Лига 2026",
          clubs: exportedClubs,
          fixtures: exportedFixtures,
        },
        null,
        2
      ),
      "utf8"
    );
    console.log(
      `[KFF Scraper] Exported snapshot (${totalPlayers} players, ${exportedClubs.length} clubs, ${exportedFixtures.length} fixtures) to ${ROSTER_SNAPSHOT_PATH}.`
    );
  }

  return {
    success: true,
    totalPlayers,
    clubs: exportedClubs.length,
    fixtures: exportedFixtures.length,
    source: KFF_SITE_URL,
  };
}

// Execute when invoked directly (`npx tsx scripts/sync-rosters.ts`)
if (require.main === module) {
  scrapeAndSeedQFL()
    .catch((err) => {
      console.error("[KFF Scraper CLI] Fatal error:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
