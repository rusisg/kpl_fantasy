import type { Prisma, PrismaClient } from "@prisma/client";
import type { LeagueStandingRow, LeagueSummary } from "./types";

export const OVERALL_LEAGUE_SLUG = "overall";
export const OVERALL_LEAGUE_CODE = "KPL-OVERALL";
export const OVERALL_LEAGUE_DEFAULT_NAME = "Overall Kazakhstan";

export function clubSupportersSlug(shortName: string): string {
  return `fans-${shortName.trim().toLowerCase()}`;
}

export function clubSupportersCode(shortName: string): string {
  return `KPL-${shortName.trim().toUpperCase()}`;
}

export function clubSupportersDefaultName(clubName: string): string {
  return `${clubName} Supporters League`;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Idempotently seeds the "Overall Kazakhstan" system league (`slug: "overall"`)
 * and one Club Supporters League (`slug: "fans-<short>"`) for every club in the database.
 */
export async function seedSystemLeagues(db: DbClient) {
  const overallLeague = await db.league.upsert({
    where: { slug: OVERALL_LEAGUE_SLUG },
    update: {
      name: OVERALL_LEAGUE_DEFAULT_NAME,
      code: OVERALL_LEAGUE_CODE,
      isPrivate: false,
      isSystem: true,
      clubId: null,
    },
    create: {
      slug: OVERALL_LEAGUE_SLUG,
      name: OVERALL_LEAGUE_DEFAULT_NAME,
      code: OVERALL_LEAGUE_CODE,
      isPrivate: false,
      isSystem: true,
      clubId: null,
    },
  });

  const clubs = await db.club.findMany({
    orderBy: { shortName: "asc" },
  });

  const clubLeagues = [];
  for (const club of clubs) {
    const slug = clubSupportersSlug(club.shortName);
    const code = clubSupportersCode(club.shortName);
    const name = clubSupportersDefaultName(club.name);

    const clubLeague = await db.league.upsert({
      where: { slug },
      update: {
        name,
        code,
        isPrivate: false,
        isSystem: true,
        clubId: club.id,
      },
      create: {
        slug,
        name,
        code,
        isPrivate: false,
        isSystem: true,
        clubId: club.id,
      },
    });
    clubLeagues.push(clubLeague);
  }

  // Also ensure any existing squads are enrolled into their system leagues
  const existingSquads = await db.squad.findMany({
    select: {
      id: true,
      userId: true,
      user: {
        select: { favoriteClubId: true },
      },
    },
  });

  for (const sq of existingSquads) {
    await enrollSquadInSystemLeagues(db, {
      userId: sq.userId,
      squadId: sq.id,
      favoriteClubId: sq.user?.favoriteClubId ?? null,
    });
  }

  return {
    overallLeague,
    clubLeagues,
    totalSystemLeagues: 1 + clubLeagues.length,
  };
}

/**
 * Idempotently enrolls a user's squad into:
 * 1. The "Overall Kazakhstan" system league (`slug: "overall"`).
 * 2. Their favorite club's Supporters League (`slug: "fans-<short>"`) if `favoriteClubId` is set,
 *    while ensuring they are removed from any rival club's Supporters League.
 */
export async function enrollSquadInSystemLeagues(
  db: DbClient,
  params: {
    userId: string;
    squadId: string;
    favoriteClubId?: string | null;
  }
) {
  const { userId, squadId } = params;

  // 1. Ensure Overall Kazakhstan league exists and enroll the squad
  const overallLeague = await db.league.upsert({
    where: { slug: OVERALL_LEAGUE_SLUG },
    update: {
      isPrivate: false,
      isSystem: true,
      clubId: null,
    },
    create: {
      slug: OVERALL_LEAGUE_SLUG,
      name: OVERALL_LEAGUE_DEFAULT_NAME,
      code: OVERALL_LEAGUE_CODE,
      isPrivate: false,
      isSystem: true,
      clubId: null,
    },
  });

  await db.leagueMember.upsert({
    where: {
      leagueId_squadId: {
        leagueId: overallLeague.id,
        squadId,
      },
    },
    create: {
      leagueId: overallLeague.id,
      squadId,
      userId,
    },
    update: {
      userId,
    },
  });

  // 2. Resolve favoriteClubId from params or User record
  let effectiveFavoriteClubId = params.favoriteClubId;
  if (effectiveFavoriteClubId === undefined) {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { favoriteClubId: true },
    });
    effectiveFavoriteClubId = u?.favoriteClubId ?? null;
  }

  // 3. Remove squad from any rival system club supporters leagues
  await db.leagueMember.deleteMany({
    where: {
      squadId,
      league: {
        isSystem: true,
        NOT: { slug: OVERALL_LEAGUE_SLUG },
        ...(effectiveFavoriteClubId
          ? {
              OR: [
                { clubId: { not: effectiveFavoriteClubId } },
                { clubId: null },
              ],
            }
          : {}),
      },
    },
  });

  // 4. If user has a favorite club, ensure its Supporters League exists and enroll the squad
  let clubLeague = null;
  if (effectiveFavoriteClubId) {
    const club = await db.club.findUnique({
      where: { id: effectiveFavoriteClubId },
    });

    if (club) {
      const slug = clubSupportersSlug(club.shortName);
      const code = clubSupportersCode(club.shortName);
      const name = clubSupportersDefaultName(club.name);

      clubLeague = await db.league.upsert({
        where: { slug },
        update: {
          clubId: club.id,
          isPrivate: false,
          isSystem: true,
        },
        create: {
          slug,
          name,
          code,
          isPrivate: false,
          isSystem: true,
          clubId: club.id,
        },
      });

      await db.leagueMember.upsert({
        where: {
          leagueId_squadId: {
            leagueId: clubLeague.id,
            squadId,
          },
        },
        create: {
          leagueId: clubLeague.id,
          squadId,
          userId,
        },
        update: {
          userId,
        },
      });
    }
  }

  return { overallLeague, clubLeague };
}

/**
 * Queries all leagues relevant to a user (Overall Kazakhstan, their Favorite Club Supporters League,
 * and any joined/created custom leagues) and computes ranked standings sorted by points.
 */
export async function fetchUserLeaguesWithStandings(
  db: DbClient,
  userId: string,
  favoriteClubId?: string | null
): Promise<LeagueSummary[]> {
  const activeGw = await db.gameweek.findFirst({
    where: { isCurrent: true },
    orderBy: { id: "asc" },
  });

  const leagues = await db.league.findMany({
    where: {
      OR: [
        { slug: OVERALL_LEAGUE_SLUG },
        ...(favoriteClubId ? [{ isSystem: true, clubId: favoriteClubId }] : []),
        {
          members: {
            some: {
              OR: [{ userId }, { squad: { userId } }],
            },
          },
        },
      ],
    },
    include: {
      club: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          squad: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
              snapshots: {
                orderBy: { gameweekId: "desc" },
                take: 1,
                ...(activeGw ? { where: { gameweekId: activeGw.id } } : {}),
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const mapped: LeagueSummary[] = leagues.map((league) => {
    const rawRows = league.members.map((m) => {
      const latestSnapshot = m.squad.snapshots[0];
      const gwPoints = latestSnapshot?.totalPoints ?? 0;
      const totalPoints = m.squad.totalPoints ?? 0;
      const resolvedUser = m.user ?? m.squad.user;
      const managerName =
        resolvedUser?.name ||
        resolvedUser?.email?.split("@")[0] ||
        "KPL Manager";

      return {
        memberId: m.id,
        squadId: m.squadId,
        userId: resolvedUser?.id ?? m.userId ?? null,
        teamName: m.squad.name,
        managerName,
        gameweekPoints: gwPoints,
        totalPoints,
        joinedAtMs: m.joinedAt.getTime(),
        isCurrentUser: (resolvedUser?.id ?? m.userId) === userId,
      };
    });

    rawRows.sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.gameweekPoints - a.gameweekPoints ||
        a.joinedAtMs - b.joinedAtMs
    );

    let currentRank = 1;
    const standings: LeagueStandingRow[] = rawRows.map((row, idx) => {
      if (
        idx > 0 &&
        (row.totalPoints < rawRows[idx - 1].totalPoints ||
          row.gameweekPoints < rawRows[idx - 1].gameweekPoints)
      ) {
        currentRank = idx + 1;
      }
      return {
        rank: currentRank,
        memberId: row.memberId,
        squadId: row.squadId,
        userId: row.userId,
        teamName: row.teamName,
        managerName: row.managerName,
        gameweekPoints: row.gameweekPoints,
        totalPoints: row.totalPoints,
        isCurrentUser: row.isCurrentUser,
      };
    });

    const userRow = standings.find((r) => r.isCurrentUser);

    return {
      id: league.id,
      slug: league.slug,
      name: league.name,
      code: league.code,
      isPrivate: league.isPrivate,
      isSystem: league.isSystem,
      clubId: league.clubId,
      club: league.club,
      createdById: league.createdById,
      createdAt: league.createdAt.toISOString(),
      memberCount: standings.length,
      userRank: userRow?.rank ?? null,
      standings,
    };
  });

  // Sort: 1) Overall Kazakhstan, 2) Club Supporters League, 3) Custom leagues by createdAt desc
  mapped.sort((a, b) => {
    const priority = (l: LeagueSummary) => {
      if (l.slug === OVERALL_LEAGUE_SLUG) return 0;
      if (l.isSystem) return 1;
      return 2;
    };
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return mapped;
}
