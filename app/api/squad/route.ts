import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUserId } from "../../../lib/session";
import { Position } from "../../../lib/types";
import {
  SQUAD_LIMITS,
  validateFullSquad,
  validateStartingLineup,
  validateCaptaincy,
  SelectedSquadPlayerInput,
} from "../../../lib/squad-validation";

const SquadSlotSchema = z.object({
  id: z.string().trim().min(1, "Player ID is required"),
  positionOrder: z.number().int().min(1).max(15),
});

export const SquadSavePayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Squad name is required")
      .max(50, "Squad name must be 50 characters or fewer")
      .default("My KPL XI"),
    players: z
      .array(SquadSlotSchema)
      .length(15, "Squad must contain exactly 15 players"),
    captainId: z.string().trim().min(1, "Captain ID is required"),
    viceCaptainId: z.string().trim().min(1, "Vice-Captain ID is required"),
  })
  .refine(
    (data) => {
      const orders = new Set(data.players.map((p) => p.positionOrder));
      return orders.size === 15;
    },
    {
      message: "Each squad slot must have a unique positionOrder from 1 to 15.",
      path: ["players"],
    }
  )
  .refine(
    (data) => {
      const ids = new Set(data.players.map((p) => p.id));
      return ids.size === 15;
    },
    {
      message: "Squad cannot contain duplicate player IDs.",
      path: ["players"],
    }
  );

export async function GET() {
  try {
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const squad = await prisma.squad.findUnique({
      where: { userId },
      include: {
        players: {
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
    const userId = await resolveAuthenticatedUserId();
    if (!userId) {
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

    const parsed = SquadSavePayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "payload",
        message: issue.message,
      }));
      return NextResponse.json(
        {
          success: false,
          error: errors[0]?.message ?? "Invalid squad payload.",
          errors,
        },
        { status: 400 }
      );
    }

    const { name, players, captainId, viceCaptainId } = parsed.data;

    // 1. Fetch current player prices & clubIds directly from database
    const playerIds = players.map((p) => p.id);
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
    const enrichedPlayers: SelectedSquadPlayerInput[] = players.map((p) => {
      const dbPlayer = playerMap.get(p.id)!;
      return {
        id: dbPlayer.id,
        position: dbPlayer.position as Position,
        price: Number(dbPlayer.price),
        clubId: dbPlayer.clubId,
        positionOrder: p.positionOrder,
        isCaptain: p.id === captainId,
        isViceCaptain: p.id === viceCaptainId,
      };
    });

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
    const captaincyValidation = validateCaptaincy(
      startingXI,
      captainId,
      viceCaptainId
    );
    if (!captaincyValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: captaincyValidation.errors },
        { status: 422 }
      );
    }

    // 5. Calculate remaining budget (integer tenths)
    const totalSpentTenths = enrichedPlayers.reduce(
      (sum, p) => sum + Math.round(Number(p.price) * 10),
      0
    );
    const maxBudgetTenths = Math.round(SQUAD_LIMITS.MAX_BUDGET * 10);
    const remainingBudget = Number(
      ((maxBudgetTenths - totalSpentTenths) / 10).toFixed(1)
    );

    // 6. Upsert Squad and SquadPlayers inside a Prisma transaction
    const savedSquad = await prisma.$transaction(async (tx) => {
      // Ensure the authenticated user record exists in local dev mode
      let user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("Authenticated user record not found.");
        }
        user = await tx.user.create({
          data: {
            id: userId,
            email: `${userId}@local.kplfantasy.dev`,
            name: name || "Manager",
          },
        });
      }

      const squadRecord = await tx.squad.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          name: name || "My KPL XI",
          budget: remainingBudget,
        },
        update: {
          name: name || "My KPL XI",
          budget: remainingBudget,
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
          players: {
            include: {
              player: {
                include: {
                  club: { select: { id: true, name: true, shortName: true } },
                },
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
