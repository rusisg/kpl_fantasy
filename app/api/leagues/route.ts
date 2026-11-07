import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUser } from "../../../lib/session";
import {
  enrollSquadInSystemLeagues,
  fetchUserLeaguesWithStandings,
  OVERALL_LEAGUE_CODE,
  OVERALL_LEAGUE_DEFAULT_NAME,
  OVERALL_LEAGUE_SLUG,
} from "../../../lib/system-leagues";

const CreateLeagueSchema = z.object({
  action: z.literal("CREATE"),
  name: z
    .string()
    .trim()
    .min(2, "League name must be at least 2 characters")
    .max(50, "League name must be 50 characters or fewer"),
  isPrivate: z.boolean().default(true),
});

const JoinLeagueSchema = z.object({
  action: z.literal("JOIN"),
  code: z
    .string()
    .trim()
    .min(4, "Invite code is required")
    .max(16, "Invalid invite code"),
});

const LeagueActionSchema = z.discriminatedUnion("action", [
  CreateLeagueSchema,
  JoinLeagueSchema,
]);

const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateInviteCodeCandidate(): string {
  const bytes = randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return `KPL-${suffix}`;
}

function normalizeInviteCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (cleaned.startsWith("KPL-")) return cleaned;
  if (cleaned.length === 4) return `KPL-${cleaned}`;
  return cleaned;
}

export async function GET() {
  try {
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userSquad = await prisma.squad.findUnique({
      where: { userId: user.id },
      select: { id: true, name: true, totalPoints: true },
    });

    if (userSquad) {
      await enrollSquadInSystemLeagues(prisma, {
        userId: user.id,
        squadId: userSquad.id,
        favoriteClubId: user.favoriteClubId,
      });
    } else {
      await prisma.league.upsert({
        where: { slug: OVERALL_LEAGUE_SLUG },
        update: { isPrivate: false, isSystem: true },
        create: {
          slug: OVERALL_LEAGUE_SLUG,
          name: OVERALL_LEAGUE_DEFAULT_NAME,
          code: OVERALL_LEAGUE_CODE,
          isPrivate: false,
          isSystem: true,
        },
      });
    }

    const leagues = await fetchUserLeaguesWithStandings(
      prisma,
      user.id,
      user.favoriteClubId
    );

    return NextResponse.json({
      success: true,
      data: leagues,
      hasSquad: Boolean(userSquad),
      squad: userSquad,
      favoriteClub: user.favoriteClub ?? null,
    });
  } catch (error) {
    console.error("GET /api/leagues error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch mini-leagues." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const parsed = LeagueActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid league request.",
        },
        { status: 400 }
      );
    }

    const squad = await prisma.squad.findUnique({
      where: { userId: user.id },
    });

    if (!squad) {
      return NextResponse.json(
        {
          success: false,
          error: "You must build and save a squad before creating or joining a mini-league.",
        },
        { status: 422 }
      );
    }

    if (parsed.data.action === "CREATE") {
      const { name, isPrivate } = parsed.data;

      // Generate a unique collision-checked KPL-XXXX invite code
      let inviteCode = generateInviteCodeCandidate();
      for (let attempt = 0; attempt < 8; attempt++) {
        const collision = await prisma.league.findUnique({
          where: { code: inviteCode },
          select: { id: true },
        });
        if (!collision) break;
        inviteCode = generateInviteCodeCandidate();
      }

      const createdLeague = await prisma.$transaction(async (tx) => {
        const league = await tx.league.create({
          data: {
            name,
            code: inviteCode,
            isPrivate,
            createdById: user.id,
          },
        });

        await tx.leagueMember.create({
          data: {
            leagueId: league.id,
            squadId: squad.id,
            userId: user.id,
          },
        });

        return league;
      });

      const leagues = await fetchUserLeaguesWithStandings(
        prisma,
        user.id,
        user.favoriteClubId
      );

      return NextResponse.json({
        success: true,
        message: `Created league "${createdLeague.name}" (${createdLeague.code}).`,
        leagueId: createdLeague.id,
        code: createdLeague.code,
        data: leagues,
      });
    }

    // action === "JOIN"
    const normalizedCode = normalizeInviteCode(parsed.data.code);
    const targetLeague = await prisma.league.findFirst({
      where: {
        OR: [
          { code: { equals: normalizedCode, mode: "insensitive" } },
          { code: { equals: parsed.data.code.trim(), mode: "insensitive" } },
        ],
      },
    });

    if (!targetLeague) {
      return NextResponse.json(
        {
          success: false,
          error: `No mini-league found with invite code "${parsed.data.code.trim()}".`,
        },
        { status: 404 }
      );
    }

    if (
      targetLeague.isSystem &&
      targetLeague.clubId &&
      targetLeague.clubId !== user.favoriteClubId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Club Supporters Leagues are reserved for managers who selected that club as their favourite.",
        },
        { status: 403 }
      );
    }

    await prisma.leagueMember.upsert({
      where: {
        leagueId_squadId: {
          leagueId: targetLeague.id,
          squadId: squad.id,
        },
      },
      create: {
        leagueId: targetLeague.id,
        squadId: squad.id,
        userId: user.id,
      },
      update: {
        userId: user.id,
      },
    });

    const leagues = await fetchUserLeaguesWithStandings(
      prisma,
      user.id,
      user.favoriteClubId
    );

    return NextResponse.json({
      success: true,
      message: `Joined "${targetLeague.name}"!`,
      leagueId: targetLeague.id,
      data: leagues,
    });
  } catch (error) {
    console.error("POST /api/leagues error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process mini-league request." },
      { status: 500 }
    );
  }
}
