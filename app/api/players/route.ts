import { NextResponse } from "next/server";
import { Prisma, Position } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import {
  calculateFixtureDifficulty,
  formatFixtureOpponentTag,
} from "../../../lib/fdr";
import { PlayerSeasonStats, PlayerUpcomingFixture } from "../../../lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    const positionParam = searchParams.get("position");
    const clubIdParam = searchParams.get("clubId");
    const searchParam = searchParams.get("search");
    const maxPriceParam = searchParams.get("maxPrice");

    const whereClause: Prisma.PlayerWhereInput = {};

    if (idParam && idParam.trim().length > 0) {
      whereClause.id = idParam.trim();
    }

    if (
      positionParam &&
      Object.values(Position).includes(positionParam as Position)
    ) {
      whereClause.position = positionParam as Position;
    }

    if (clubIdParam) {
      whereClause.clubId = clubIdParam;
    }

    if (maxPriceParam) {
      const parsedPrice = parseFloat(maxPriceParam);
      if (!isNaN(parsedPrice)) {
        whereClause.price = { lte: parsedPrice };
      }
    }

    if (searchParam && searchParam.trim().length > 0) {
      const term = searchParam.trim();
      whereClause.OR = [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
      ];
    }

    const [
      players,
      totalSquads,
      ownershipGroups,
      currentGw,
      firstUnfinishedGw,
      allClubs,
      allFixtures,
    ] = await Promise.all([
      prisma.player.findMany({
        where: whereClause,
        include: {
          club: {
            select: {
              id: true,
              name: true,
              shortName: true,
              logoUrl: true,
            },
          },
          performances: {
            orderBy: { gameweekId: "desc" },
          },
        },
        orderBy: [{ price: "desc" }, { lastName: "asc" }],
      }),
      prisma.squad.count(),
      prisma.squadPlayer.groupBy({
        by: ["playerId"],
        _count: { squadId: true },
      }),
      prisma.gameweek.findFirst({
        where: { isCurrent: true },
        orderBy: { id: "asc" },
      }),
      prisma.gameweek.findFirst({
        where: { isFinished: false },
        orderBy: { id: "asc" },
      }),
      prisma.club.findMany({
        select: { id: true, shortName: true },
      }),
      prisma.fixture.findMany({
        include: {
          homeClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
          awayClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
        },
        orderBy: [{ gameweekId: "asc" }, { kickoffTime: "asc" }],
      }),
    ]);

    const activeGwId = currentGw?.id ?? firstUnfinishedGw?.id ?? 1;
    const clubShortNameMap = new Map(
      allClubs.map((c) => [c.id, c.shortName])
    );

    const ownershipByPlayerId = new Map<string, number>();
    for (const row of ownershipGroups) {
      ownershipByPlayerId.set(row.playerId, row._count.squadId);
    }

    // Precompute the next 5 fixtures + FDR per club
    const fixturesByClubId = new Map<string, typeof allFixtures>();
    for (const fixture of allFixtures) {
      const homeList = fixturesByClubId.get(fixture.homeClubId) ?? [];
      homeList.push(fixture);
      fixturesByClubId.set(fixture.homeClubId, homeList);

      const awayList = fixturesByClubId.get(fixture.awayClubId) ?? [];
      awayList.push(fixture);
      fixturesByClubId.set(fixture.awayClubId, awayList);
    }

    const upcomingByClubId = new Map<string, PlayerUpcomingFixture[]>();
    for (const [clubId, clubFixtures] of fixturesByClubId.entries()) {
      const fromActive = clubFixtures.filter((f) => f.gameweekId >= activeGwId);
      const selectedWindow =
        fromActive.length >= 5
          ? fromActive.slice(0, 5)
          : clubFixtures.slice(-5);

      const mappedFixtures: PlayerUpcomingFixture[] = selectedWindow.map((f) => {
        const isHome = f.homeClubId === clubId;
        const opponent = isHome ? f.awayClub : f.homeClub;
        const fdr = calculateFixtureDifficulty(
          clubId,
          opponent.id,
          isHome,
          clubShortNameMap
        );
        return {
          fixtureId: f.id,
          gameweekId: f.gameweekId,
          kickoffTime: f.kickoffTime.toISOString(),
          opponentClubId: opponent.id,
          opponentName: opponent.name,
          opponentShortName: opponent.shortName,
          opponentLogoUrl: opponent.logoUrl,
          isHome,
          fdr,
          tag: formatFixtureOpponentTag(opponent.shortName, isHome),
        };
      });

      upcomingByClubId.set(clubId, mappedFixtures);
    }

    const enrichedPlayers = players.map((player) => {
      const ownedCount = ownershipByPlayerId.get(player.id) ?? 0;
      const selectedByPercent =
        totalSquads > 0
          ? Number(((ownedCount / totalSquads) * 100).toFixed(1))
          : 0;

      const perfs = player.performances;
      let goalsScored = 0;
      let assists = 0;
      let cleanSheets = 0;
      let minutes = 0;
      let yellowCards = 0;
      let redCards = 0;
      let saves = 0;
      let bonusPoints = 0;
      let appearances = 0;

      for (const p of perfs) {
        goalsScored += p.goalsScored;
        assists += p.assists;
        cleanSheets += p.cleanSheets;
        minutes += p.minutes;
        yellowCards += p.yellowCards;
        redCards += p.redCards;
        saves += p.saves;
        bonusPoints += p.bonusPoints;
        if (p.minutes > 0) appearances += 1;
      }

      const last3 = perfs.slice(0, 3);
      const form =
        last3.length > 0
          ? Number(
              (
                last3.reduce((sum, p) => sum + p.totalPoints, 0) / last3.length
              ).toFixed(1)
            )
          : Number(((player.totalPoints ?? 0) / 3).toFixed(1));

      const stats: PlayerSeasonStats = {
        totalPoints: player.totalPoints ?? 0,
        goalsScored,
        assists,
        cleanSheets,
        minutes,
        yellowCards,
        redCards,
        saves,
        bonusPoints,
        appearances,
        form,
      };

      const { performances: _performances, ...restPlayer } = player;
      void _performances;

      return {
        ...restPlayer,
        price: Number(player.price),
        selectedByPercent,
        upcomingFixtures: upcomingByClubId.get(player.clubId) ?? [],
        stats,
      };
    });

    return NextResponse.json({
      success: true,
      count: enrichedPlayers.length,
      data: enrichedPlayers,
    });
  } catch (error) {
    console.error("GET /api/players error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch player market." },
      { status: 500 }
    );
  }
}
