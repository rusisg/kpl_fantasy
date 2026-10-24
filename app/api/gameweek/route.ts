import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    let gameweek = await prisma.gameweek.findFirst({
      where: { isCurrent: true },
      orderBy: { id: "asc" },
    });

    if (!gameweek) {
      gameweek = await prisma.gameweek.findFirst({
        where: { isFinished: false },
        orderBy: { id: "asc" },
      });
    }

    if (!gameweek) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    const now = new Date();
    const isLocked = gameweek.isFinished || gameweek.deadline.getTime() <= now.getTime();

    return NextResponse.json({
      success: true,
      data: {
        id: gameweek.id,
        deadline: gameweek.deadline.toISOString(),
        isCurrent: gameweek.isCurrent,
        isFinished: gameweek.isFinished,
        isLocked,
      },
    });
  } catch (error) {
    console.error("GET /api/gameweek error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch active gameweek." },
      { status: 500 }
    );
  }
}
