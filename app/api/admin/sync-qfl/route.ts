import { NextResponse } from "next/server";
import { verifyAdminRequest } from "../../../../lib/admin-auth";
import { seedQFLDatabase } from "../../../../lib/qfl-ingestion";

export async function POST(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { error: "Forbidden: Invalid or missing admin authentication." },
      { status: 403 }
    );
  }

  try {
    await seedQFLDatabase();
    return NextResponse.json({
      success: true,
      message: "QFL database seeded with initial clubs and rosters.",
    });
  } catch (error) {
    console.error("QFL sync error:", error);
    return NextResponse.json(
      { error: "Failed to seed QFL data" },
      { status: 500 }
    );
  }
}
