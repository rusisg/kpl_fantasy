import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  verifyAdminRequest,
  verifyRawAdminSecret,
} from "../../../../lib/admin-auth";

const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export async function GET(request: Request) {
  const authenticated = await verifyAdminRequest(request);
  if (!authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      secret?: string;
    };
    const providedSecret = typeof body.secret === "string" ? body.secret : "";

    if (!verifyRawAdminSecret(providedSecret)) {
      return NextResponse.json(
        { authenticated: false, error: "Invalid admin passcode." },
        { status: 401 }
      );
    }

    const sessionToken = createAdminSessionToken();
    const isSecure = request.url.startsWith("https://");
    const cookieStore = await cookies();

    cookieStore.set(ADMIN_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isSecure,
      maxAge: ADMIN_SESSION_MAX_AGE,
    });

    return NextResponse.json({
      authenticated: true,
      token: sessionToken,
    });
  } catch (error) {
    console.error("POST /api/admin/auth error:", error);
    return NextResponse.json(
      { authenticated: false, error: "Failed to verify admin passcode." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  return NextResponse.json({ authenticated: false });
}
