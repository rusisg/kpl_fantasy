import { NextResponse } from "next/server";
import { computeTelegramAuthHash } from "../../../../../lib/telegram-auth";
import { authenticateAndPersistTelegramUser } from "../../../../../lib/telegram-auth-service";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Dev login is disabled in production." },
      { status: 403 }
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_BOT_TOKEN is not configured." },
      { status: 500 }
    );
  }

  let body: {
    id?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  } = {};

  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    // Empty or non-JSON body is acceptable
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const testPayload: Record<string, string> = {
    id: body.id ? String(body.id) : "777000123",
    first_name: body.first_name || "KPL",
    last_name: body.last_name || "Manager",
    username: body.username || "kpl_telegram_manager",
    auth_date: String(nowSec),
  };

  const hash = computeTelegramAuthHash(testPayload, botToken);
  const signedPayload: Record<string, string> = {
    ...testPayload,
    hash,
  };

  try {
    const result = await authenticateAndPersistTelegramUser(
      signedPayload,
      request
    );
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
  } catch (err) {
    console.error("Dev login execution error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to authenticate dev user." },
      { status: 500 }
    );
  }
}
