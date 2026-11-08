import { NextResponse } from "next/server";
import {
  authenticateAndPersistTelegramUser,
  resolveRequestOrigin,
} from "../../../../../lib/telegram-auth-service";

/**
 * POST /api/auth/telegram/callback
 * Accepts Telegram Login Widget payload via JSON, verifies HMAC-SHA256 signature,
 * links/provisions the User in PostgreSQL, sets session cookies, and returns `{ success: true, redirectUrl: "/squad" }`.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload: Record<string, string | number> = {};

    for (const [k, v] of Object.entries(body ?? {})) {
      if (typeof v === "string" || typeof v === "number") {
        payload[k] = v;
      }
    }

    const result = await authenticateAndPersistTelegramUser(payload, request);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      redirectUrl: "/squad",
      user: result.user,
    });
  } catch (error) {
    console.error("Telegram callback error (POST):", error);
    return NextResponse.json(
      { success: false, error: "Internal server error during Telegram login." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/telegram/callback
 * Accepts Telegram Login redirect with query parameters:
 * ?id=...&first_name=...&username=...&auth_date=...&hash=...
 */
export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const payload: Record<string, string> = {};

  reqUrl.searchParams.forEach((value, key) => {
    payload[key] = value;
  });

  const origin = resolveRequestOrigin(request);

  if (!payload.hash || !payload.id) {
    return NextResponse.redirect(
      new URL("/login?error=TelegramPayloadMissing", origin)
    );
  }

  try {
    const result = await authenticateAndPersistTelegramUser(payload, request);
    if (!result.ok) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(result.error || "TelegramAuthFailed")}`,
          origin
        )
      );
    }

    return NextResponse.redirect(new URL("/squad", origin));
  } catch (error) {
    console.error("Telegram callback error (GET):", error);
    return NextResponse.redirect(
      new URL("/login?error=TelegramAuthInternalError", origin)
    );
  }
}
