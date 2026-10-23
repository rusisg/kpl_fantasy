import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUserId } from "../../../lib/session";
import { generateAutopickSquad } from "../../../lib/autopick-engine";
import { SQUAD_LIMITS } from "../../../lib/squad-validation";

const OnboardingPayloadSchema = z.object({
  teamName: z
    .string()
    .trim()
    .min(1, "Team name is required")
    .max(50, "Team name must be 50 characters or fewer"),
  favoriteClubId: z.string().trim().min(1).nullable().optional(),
  strategy: z.enum(["BALANCED", "PREMIUM_ATTACK"]).default("BALANCED"),
  maximizeFavorite: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
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

    const { teamName, favoriteClubId, strategy, maximizeFavorite } = parsed.data;

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
      maximizeFavorite
    );

    const spentTenths = autoPickedPlayers.reduce(
      (sum, p) => sum + Math.round(p.price * 10),
      0
    );
    const maxTenths = Math.round(SQUAD_LIMITS.MAX_BUDGET * 10);
    const remainingBudget = Number(((maxTenths - spentTenths) / 10).toFixed(1));

    // Save transaction idempotently
    await prisma.$transaction(async (tx) => {
      // 1. Update User Profile
      await tx.user.update({
        where: { id: userId },
        data: { favoriteClubId: resolvedClubId },
      });

      // 2. Upsert Squad
      const squad = await tx.squad.upsert({
        where: { userId },
        create: {
          userId,
          name: teamName,
          budget: remainingBudget,
        },
        update: {
          name: teamName,
          budget: remainingBudget,
        },
      });

      // 3. Replace Squad Players
      await tx.squadPlayer.deleteMany({
        where: { squadId: squad.id },
      });

      await tx.squadPlayer.createMany({
        data: autoPickedPlayers.map((p) => ({
          squadId: squad.id,
          playerId: p.playerId,
          positionOrder: p.positionOrder,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
        })),
      });
    });

    return NextResponse.json({ success: true, redirect: "/squad" });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to initialize squad" },
      { status: 500 }
    );
  }
}
