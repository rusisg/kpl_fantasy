import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        name: true,
        shortName: true,
        logoUrl: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      count: clubs.length,
      data: clubs,
    });
  } catch (error) {
    console.error("GET /api/clubs error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch clubs from database." },
      { status: 500 }
    );
  }
}
