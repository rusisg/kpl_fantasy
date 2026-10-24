import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUser } from "../../../lib/session";
import { generateAutopickSquad } from "../../../lib/autopick-engine";
import { SQUAD_LIMITS } from "../../../lib/squad-validation";

const OnboardingPayloadSchema = z.object({
  managerName: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional(),
  teamName: z
    .string()
    .trim()
    .min(1, "Team name is required")
    .max(50, "Team name must be 50 characters or fewer"),
  favoriteClubId: z.string().trim().min(1).nullable().optional(),
  strategy: z.enum(["BALANCED", "PREMIUM_ATTACK"]).default("BALANCED"),
  maximizeFavorite: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    const parsed = OnboardingPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid onboarding payload" },
        { status: 400 }
      );
    }

    const { managerName, teamName, favoriteClubId, strategy, maximizeFavorite } =
      parsed.data;

    // Resolve favoriteClubId (accepts either a Club CUID or 3-letter shortName)
    let resolvedClubId: string | null = null;
    if (favoriteClubId) {
      const club = await prisma.club.findFirst({
        where: {
          OR: [
            { id: favoriteClubId },
            { shortName: favoriteClubId.toUpperCase() },
          ],
        },
      });
      resolvedClubId = club?.id ?? null;
    }

    // Generate initial squad using Autopick Engine
    const autoPickedPlayers = await generateAutopickSquad(
      resolvedClubId,
      strategy,
      Boolean(resolvedClubId && maximizeFavorite)
    );

    const spentTenths = autoPickedPlayers.reduce(
      (sum, p) => sum + Math.round(p.price * 10),
      0
    );
    const maxTenths = Math.round(SQUAD_LIMITS.MAX_BUDGET * 10);
    const remainingBudget = Number(((maxTenths - spentTenths) / 10).toFixed(1));

    // Save transaction idempotently and return hydrated squad
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update User Profile
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          favoriteClubId: resolvedClubId,
          ...(managerName ? { name: managerName } : {}),
        },
        include: {
          favoriteClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
        },
      });

      // 2. Upsert Squad
      const squad = await tx.squad.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          name: teamName,
          budget: remainingBudget,
        },
        update: {
          name: teamName,
          budget: remainingBudget,
        },
      });

      // 3. Replace Squad Players with locked purchasePrice
      await tx.squadPlayer.deleteMany({
        where: { squadId: squad.id },
      });

      await tx.squadPlayer.createMany({
        data: autoPickedPlayers.map((p) => ({
          squadId: squad.id,
          playerId: p.playerId,
          purchasePrice: p.price,
          positionOrder: p.positionOrder,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
        })),
      });

      const hydratedSquad = await tx.squad.findUnique({
        where: { id: squad.id },
        include: {
          players: {
            include: {
              player: {
                include: {
                  club: {
                    select: { id: true, name: true, shortName: true, logoUrl: true },
                  },
                },
              },
            },
            orderBy: { positionOrder: "asc" },
          },
        },
      });

      return { user: updatedUser, squad: hydratedSquad };
    });

    return NextResponse.json({
      success: true,
      redirect: "/squad",
      data: result.squad,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        favoriteClubId: result.user.favoriteClubId,
        favoriteClub: result.user.favoriteClub,
      },
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to initialize squad" },
      { status: 500 }
    );
  }
}
