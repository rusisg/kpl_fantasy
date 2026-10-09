import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  validateFullSquad,
  validateStartingLineup,
  validateCaptaincy,
  SelectedSquadPlayerInput,
} from "../../../lib/squad-validation";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: userId" },
        { status: 400 }
      );
    }

    const squad = await prisma.squad.findUnique({
      where: { userId },
      include: {
        squadPlayers: {
          include: {
            player: {
              include: {
                club: {
                  select: { id: true, name: true, shortName: true },
                },
              },
            },
          },
          orderBy: { positionOrder: "asc" },
        },
      },
    });

    if (!squad) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: squad,
    });
  } catch (error) {
    console.error("GET /api/squad error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user squad." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, name, players, captainId, viceCaptainId } = body;

    if (!userId || !players || !Array.isArray(players) || players.length !== 15) {
      return NextResponse.json(
        { success: false, error: "Payload must contain userId and 15 squad players." },
        { status: 400 }
      );
    }

    // 1. Fetch current player prices & clubIds directly from database
    const playerIds = players.map((p: SelectedSquadPlayerInput) => p.id);
    const dbPlayers = await prisma.player.findMany({
      where: { id: { in: playerIds } },
    });

    if (dbPlayers.length !== 15) {
      return NextResponse.json(
        { success: false, error: "One or more invalid player IDs provided." },
        { status: 400 }
      );
    }

    const playerMap = new Map(dbPlayers.map((p) => [p.id, p]));

    // Construct enriched inputs with verified DB attributes
    const enrichedPlayers: SelectedSquadPlayerInput[] = players.map(
      (p: SelectedSquadPlayerInput) => {
        const dbPlayer = playerMap.get(p.id)!;
        return {
          id: dbPlayer.id,
          position: dbPlayer.position,
          price: Number(dbPlayer.price),
          clubId: dbPlayer.clubId,
          positionOrder: p.positionOrder,
          isCaptain: p.id === captainId,
          isViceCaptain: p.id === viceCaptainId,
        };
      }
    );

    // 2. Perform Full Squad Validation
    const squadValidation = validateFullSquad(enrichedPlayers);
    if (!squadValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: squadValidation.errors },
        { status: 422 }
      );
    }

    // 3. Separate Starting XI (order 1-11) and Bench (order 12-15)
    const startingXI = enrichedPlayers.filter((p) => p.positionOrder <= 11);
    const lineupValidation = validateStartingLineup(startingXI);
    if (!lineupValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: lineupValidation.errors },
        { status: 422 }
      );
    }

    // 4. Perform Captaincy Validation
    const captaincyValidation = validateCaptaincy(startingXI, captainId, viceCaptainId);
    if (!captaincyValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: captaincyValidation.errors },
        { status: 422 }
      );
    }

    // 5. Calculate remaining budget
    const totalSpent = enrichedPlayers.reduce((sum, p) => sum + Number(p.price), 0);
    const remainingBudget = Number((100.0 - totalSpent).toFixed(1));

    // 6. Upsert Squad and SquadPlayers inside a Prisma transaction
    const savedSquad = await prisma.$transaction(async (tx) => {
      // Find or verify user exists
      let user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        user = await tx.user.create({
          data: {
            id: userId,
            email: `user_${userId}@kplfantasy.kz`,
            name: name || "Manager",
          },
        });
      }

      const squadRecord = await tx.squad.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          name: name || "My KPL XI",
          remainingBudget,
        },
        update: {
          name: name || "My KPL XI",
          remainingBudget,
        },
      });

      // Clear previous squad player links
      await tx.squadPlayer.deleteMany({
        where: { squadId: squadRecord.id },
      });

      // Insert new squad players
      await tx.squadPlayer.createMany({
        data: enrichedPlayers.map((p) => ({
          squadId: squadRecord.id,
          playerId: p.id,
          positionOrder: p.positionOrder,
          isCaptain: p.id === captainId,
          isViceCaptain: p.id === viceCaptainId,
        })),
      });

      return tx.squad.findUnique({
        where: { id: squadRecord.id },
        include: {
          squadPlayers: {
            include: {
              player: {
                include: { club: { select: { id: true, name: true, shortName: true } } },
              },
            },
            orderBy: { positionOrder: "asc" },
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: savedSquad,
    });
  } catch (error) {
    console.error("POST /api/squad error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save squad." },
      { status: 500 }
    );
  }
}