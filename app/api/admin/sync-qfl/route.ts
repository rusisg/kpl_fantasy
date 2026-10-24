import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { seedQFLDatabase } from "../../../../lib/qfl-ingestion";

function verifyAdminSecret(request: Request): boolean {
  const configuredSecret = process.env.ADMIN_SECRET;
  const providedSecret = request.headers.get("x-admin-secret");
  if (!configuredSecret || !providedSecret) {
    return false;
  }
  const a = Buffer.from(configuredSecret, "utf8");
  const b = Buffer.from(providedSecret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!verifyAdminSecret(request)) {
    return NextResponse.json(
      { error: "Forbidden: Invalid or missing x-admin-secret header." },
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
