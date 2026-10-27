import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { resolveAuthenticatedUser } from "../../../../lib/session";
import { ChipType } from "../../../../lib/types";

const ChipPayloadSchema = z.object({
  chip: z
    .enum(["WILDCARD", "TRIPLE_CAPTAIN", "BENCH_BOOST", "FREE_HIT"])
    .nullable(),
});

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

export async function POST(request: Request) {
  try {
    const user = await resolveAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const activeGameweek = await getActiveGameweekInfo();
    if (!activeGameweek) {
      return NextResponse.json(
        { success: false, error: "No active Gameweek found." },
        { status: 404 }
      );
    }

    if (activeGameweek.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Gameweek ${activeGameweek.id} deadline has passed. Chips cannot be modified.`,
        },
        { status: 423 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    const parsed = ChipPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid chip selection." },
        { status: 400 }
      );
    }

    const requestedChip = parsed.data.chip;

    const existingSquad = await prisma.squad.findUnique({
      where: { userId: user.id },
      include: {
        snapshots: {
          select: {
            id: true,
            gameweekId: true,
            chipPlayed: true,
            _count: { select: { players: true } },
          },
        },
      },
    });

    if (!existingSquad) {
      return NextResponse.json(
        { success: false, error: "Please save your 15-player squad before playing a chip." },
        { status: 400 }
      );
    }

    const currentSnap = existingSquad.snapshots.find(
      (s) => s.gameweekId === activeGameweek.id
    );
    const currentChip = (currentSnap?.chipPlayed as ChipType | null) ?? null;

    // Collect chips already consumed in previous gameweeks
    const usedInOtherGws = new Set<ChipType>();
    for (const snap of existingSquad.snapshots) {
      if (snap.gameweekId !== activeGameweek.id && snap.chipPlayed) {
        usedInOtherGws.add(snap.chipPlayed as ChipType);
      }
    }
    if (existingSquad.wildcardUsed && currentChip !== "WILDCARD") {
      usedInOtherGws.add("WILDCARD");
    }
    if (existingSquad.tripleCaptainUsed && currentChip !== "TRIPLE_CAPTAIN") {
      usedInOtherGws.add("TRIPLE_CAPTAIN");
    }
    if (existingSquad.benchBoostUsed && currentChip !== "BENCH_BOOST") {
      usedInOtherGws.add("BENCH_BOOST");
    }
    if (existingSquad.freeHitUsed && currentChip !== "FREE_HIT") {
      usedInOtherGws.add("FREE_HIT");
    }

    if (requestedChip && usedInOtherGws.has(requestedChip)) {
      return NextResponse.json(
        {
          success: false,
          error: `${requestedChip.replace("_", " ")} has already been used this season.`,
        },
        { status: 400 }
      );
    }

    const updatedSquad = await prisma.$transaction(async (tx) => {
      if (requestedChip) {
        await tx.squadSnapshot.upsert({
          where: {
            squadId_gameweekId: {
              squadId: existingSquad.id,
              gameweekId: activeGameweek.id,
            },
          },
          create: {
            squadId: existingSquad.id,
            gameweekId: activeGameweek.id,
            chipPlayed: requestedChip,
            totalPoints: 0,
          },
          update: {
            chipPlayed: requestedChip,
          },
        });

        // If Wildcard or Free Hit is activated, waive transfer costs in this gameweek
        if (requestedChip === "WILDCARD" || requestedChip === "FREE_HIT") {
          await tx.transfer.updateMany({
            where: {
              squadId: existingSquad.id,
              gameweekId: activeGameweek.id,
            },
            data: {
              cost: 0,
              isWildcard: requestedChip === "WILDCARD",
              isFreeHit: requestedChip === "FREE_HIT",
            },
          });
        }
      } else if (currentSnap) {
        await tx.squadSnapshot.update({
          where: { id: currentSnap.id },
          data: { chipPlayed: null },
        });
      }

      const allUsed = new Set<ChipType>(usedInOtherGws);
      if (requestedChip) {
        allUsed.add(requestedChip);
      }

      await tx.squad.update({
        where: { id: existingSquad.id },
        data: {
          wildcardUsed: allUsed.has("WILDCARD"),
          tripleCaptainUsed: allUsed.has("TRIPLE_CAPTAIN"),
          benchBoostUsed: allUsed.has("BENCH_BOOST"),
          freeHitUsed: allUsed.has("FREE_HIT"),
        },
      });

      const fullSquad = await tx.squad.findUnique({
        where: { id: existingSquad.id },
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
          snapshots: {
            select: {
              id: true,
              gameweekId: true,
              chipPlayed: true,
              _count: { select: { players: true } },
            },
          },
          transfers: {
            select: { gameweekId: true, cost: true },
          },
        },
      });

      if (!fullSquad) return null;

      const scoredSnapshotsCount = fullSquad.snapshots.filter(
        (s) => s._count.players > 0
      ).length;
      const isUnlimitedTransfers =
        scoredSnapshotsCount === 0 ||
        requestedChip === "WILDCARD" ||
        requestedChip === "FREE_HIT";

      const gwTransfers = fullSquad.transfers.filter(
        (t) => t.gameweekId === activeGameweek.id
      );
      const transfersThisGw = gwTransfers.length;
      const pointsHitThisGw = isUnlimitedTransfers
        ? 0
        : gwTransfers.reduce((sum, t) => sum + t.cost, 0);

      const { snapshots: _snapshots, transfers: _transfers, ...restSquad } = fullSquad;
      void _snapshots;
      void _transfers;

      return {
        ...restSquad,
        activeChip: requestedChip,
        usedChips: Array.from(usedInOtherGws),
        isUnlimitedTransfers,
        transfersThisGw,
        pointsHitThisGw,
      };
    });

    return NextResponse.json({
      success: true,
      data: updatedSquad,
    });
  } catch (error) {
    console.error("POST /api/squad/chip error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update chip." },
      { status: 500 }
    );
  }
}

