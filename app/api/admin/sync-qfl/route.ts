import { NextResponse } from "next/server";
import { seedQFLDatabase } from "../../../../lib/qfl-ingestion";

export async function POST() {
  try {
    await seedQFLDatabase();
    return NextResponse.json({ success: true, message: "QFL database seeded with official clubs and rosters." });
  } catch (error) {
    console.error("QFL sync error:", error);
    return NextResponse.json({ error: "Failed to seed QFL data" }, { status: 500 });
  }
}