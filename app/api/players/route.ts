import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { Position } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const positionParam = searchParams.get("position");
    const clubIdParam = searchParams.get("clubId");
    const searchParam = searchParams.get("search");
    const maxPriceParam = searchParams.get("maxPrice");

    const whereClause: any = {};

    if (positionParam && Object.values(Position).includes(positionParam as Position)) {
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

    const players = await prisma.player.findMany({
      where: whereClause,
      include: {
        club: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
      orderBy: [{ price: "desc" }, { lastName: "asc" }],
    });

    return NextResponse.json({
      success: true,
      count: players.length,
      data: players,
    });
  } catch (error) {
    console.error("GET /api/players error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch player market." },
      { status: 500 }
    );
  }
}