import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { resolveAuthenticatedUser } from "../../../lib/session";
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
      .max(50, "Squad name must be 50 characters or fewer"),
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

async function getActiveGameweekInfo() {
  let gw = await prisma.gameweek.findFirst({
    where: { isCurrent: true },
    orderBy: { id: "asc" },
  });
  if (!gw) {
    gw = await prisma.gameweek.findFirst({
      where: { isFinished: false },
      orderBy: { id: "asc" },
    });
  }
  if (!gw) return null;

  return {
    id: gw.id,
    deadline: gw.deadline.toISOString(),
    isCurrent: gw.isCurrent,
    isFinished: gw.isFinished,
    isLocked: gw.isFinished || gw.deadline.getTime() <= Date.now(),
  };
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

    const [squad, gameweek] = await Promise.all([
      prisma.squad.findUnique({
        where: { userId: user.id },
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
      }),
      getActiveGameweekInfo(),
    ]);

    return NextResponse.json({
      success: true,
      data: squad,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        favoriteClubId: user.favoriteClubId,
        favoriteClub: user.favoriteClub,
      },
      gameweek,
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
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 1. Check active Gameweek deadline lock
    const activeGameweek = await getActiveGameweekInfo();
    if (activeGameweek?.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Gameweek ${activeGameweek.id} deadline has passed. Squad modifications are locked.`,
        },
        { status: 423 }
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

    // 2. Fetch current player prices & clubIds directly from database, plus existing SquadPlayers for purchasePrice retention
    const playerIds = players.map((p) => p.id);
    const [dbPlayers, existingSquad] = await Promise.all([
      prisma.player.findMany({
        where: { id: { in: playerIds } },
      }),
      prisma.squad.findUnique({
        where: { userId: user.id },
        include: { players: true },
      }),
    ]);

    if (dbPlayers.length !== 15) {
      return NextResponse.json(
        { success: false, error: "One or more invalid player IDs provided." },
        { status: 400 }
      );
    }

    const playerMap = new Map(dbPlayers.map((p) => [p.id, p]));
    const existingPurchasePriceMap = new Map<string, number>();
    if (existingSquad) {
      for (const sp of existingSquad.players) {
        const lockedPrice = Number(sp.purchasePrice);
        if (lockedPrice > 0) {
          existingPurchasePriceMap.set(sp.playerId, lockedPrice);
        }
      }
    }

    // Construct enriched inputs using retained purchasePrice (if already owned) or current market price (if newly bought)
    const enrichedPlayers: (SelectedSquadPlayerInput & { purchasePrice: number })[] =
      players.map((p) => {
        const dbPlayer = playerMap.get(p.id)!;
        const effectivePurchasePrice =
          existingPurchasePriceMap.get(dbPlayer.id) ?? Number(dbPlayer.price);

        return {
          id: dbPlayer.id,
          position: dbPlayer.position as Position,
          price: effectivePurchasePrice,
          purchasePrice: effectivePurchasePrice,
          clubId: dbPlayer.clubId,
          positionOrder: p.positionOrder,
          isCaptain: p.id === captainId,
          isViceCaptain: p.id === viceCaptainId,
        };
      });

    // 3. Perform Full Squad Validation
    const squadValidation = validateFullSquad(enrichedPlayers);
    if (!squadValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: squadValidation.errors },
        { status: 422 }
      );
    }

    // 4. Separate Starting XI (order 1-11) and Bench (order 12-15)
    const startingXI = enrichedPlayers.filter((p) => p.positionOrder <= 11);
    const lineupValidation = validateStartingLineup(startingXI);
    if (!lineupValidation.isValid) {
      return NextResponse.json(
        { success: false, errors: lineupValidation.errors },
        { status: 422 }
      );
    }

    // 5. Perform Captaincy Validation
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

    // 6. Calculate remaining budget (integer tenths based on locked purchasePrice)
    const totalSpentTenths = enrichedPlayers.reduce(
      (sum, p) => sum + Math.round(Number(p.purchasePrice) * 10),
      0
    );
    const maxBudgetTenths = Math.round(SQUAD_LIMITS.MAX_BUDGET * 10);
    const remainingBudget = Number(
      ((maxBudgetTenths - totalSpentTenths) / 10).toFixed(1)
    );

    // 7. Upsert Squad, log Transfers (if modifying an existing squad), and write SquadPlayers with purchasePrice
    const savedSquad = await prisma.$transaction(async (tx) => {
      const squadRecord = await tx.squad.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          name,
          budget: remainingBudget,
        },
        update: {
          name,
          budget: remainingBudget,
        },
      });

      // Log transfers if an existing squad swapped players in an active gameweek
      if (existingSquad && existingSquad.players.length === 15 && activeGameweek) {
        const previousIds = new Set(existingSquad.players.map((sp) => sp.playerId));
        const nextIds = new Set(enrichedPlayers.map((p) => p.id));

        const playersOut = existingSquad.players
          .map((sp) => sp.playerId)
          .filter((id) => !nextIds.has(id));
        const playersIn = enrichedPlayers
          .map((p) => p.id)
          .filter((id) => !previousIds.has(id));

        const pairCount = Math.min(playersOut.length, playersIn.length);
        if (pairCount > 0) {
          await tx.transfer.createMany({
            data: Array.from({ length: pairCount }, (_, idx) => ({
              squadId: squadRecord.id,
              gameweekId: activeGameweek.id,
              playerOutId: playersOut[idx],
              playerInId: playersIn[idx],
              cost: 0,
            })),
          });
        }
      }

      // Replace squad player slots with locked purchasePrice
      await tx.squadPlayer.deleteMany({
        where: { squadId: squadRecord.id },
      });

      await tx.squadPlayer.createMany({
        data: enrichedPlayers.map((p) => ({
          squadId: squadRecord.id,
          playerId: p.id,
          purchasePrice: p.purchasePrice,
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
