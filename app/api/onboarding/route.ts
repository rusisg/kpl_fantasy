import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";
import { generateAutopickSquad } from "../../../lib/autopick-engine";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamName, favoriteClubId, strategy, maximizeFavorite } = await request.json();

    if (!teamName) {
      return NextResponse.json({ error: "Team name is required" }, { status: 400 });
    }

    // Generate initial squad using Autopick Engine
    const autoPickedPlayers = await generateAutopickSquad(
      favoriteClubId,
      strategy || "BALANCED",
      maximizeFavorite || false
    );

    // Save transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update User Profile
      await tx.user.update({
        where: { id: session.user.id },
        data: { favoriteClubId },
      });

      // 2. Create Squad
      const squad = await tx.squad.create({
        data: {
          userId: session.user.id,
          name: teamName,
          budget: 100.0, // Autopick budget calculation applied downstream
        },
      });

      // 3. Attach Players
      await tx.squadPlayer.createMany({
        data: autoPickedPlayers.map(p => ({
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
    return NextResponse.json({ error: "Failed to initialize squad" }, { status: 500 });
  }
}