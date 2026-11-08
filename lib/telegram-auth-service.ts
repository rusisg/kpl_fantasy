import { cookies } from "next/headers";
import { encode } from "@auth/core/jwt";
import { auth } from "../auth";
import { prisma } from "./prisma";
import {
  MANAGER_SESSION_COOKIE,
  signUserId,
  verifySignedToken,
} from "./session";
import {
  normalizeTelegramUser,
  verifyTelegramAuthData,
} from "./telegram-auth";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function resolveRequestOrigin(request: Request): string {
  const reqUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    reqUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    reqUrl.protocol.replace(":", "") ??
    "http";
  return `${proto}://${host}`;
}

export async function resolveExistingGuestUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const rawGuestToken = cookieStore.get(MANAGER_SESSION_COOKIE)?.value;
    if (rawGuestToken) {
      const verifiedId = verifySignedToken(rawGuestToken);
      if (verifiedId) return verifiedId;
    }
  } catch {
    // Cookie read fallback
  }

  try {
    const activeSession = await auth();
    if (activeSession?.user?.id) {
      return activeSession.user.id;
    }
  } catch {
    // NextAuth session fallback
  }

  return null;
}

export async function authenticateAndPersistTelegramUser(
  rawPayload: Record<string, string | number>,
  request: Request
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return {
      ok: false as const,
      status: 500,
      error: "TELEGRAM_BOT_TOKEN is not configured on the server.",
    };
  }

  if (!verifyTelegramAuthData(rawPayload, botToken)) {
    return {
      ok: false as const,
      status: 401,
      error: "Invalid or expired Telegram authentication signature.",
    };
  }

  const normalized = normalizeTelegramUser(rawPayload);

  // 1. Check if a user with this telegramId already exists
  let user = await prisma.user.findUnique({
    where: { telegramId: normalized.telegramId },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramUsername: normalized.username,
        name: user.name || normalized.displayName,
        ...(normalized.photoUrl ? { image: normalized.photoUrl } : {}),
      },
    });
  } else {
    // 2. If a guest session exists without a linked telegramId, link this Telegram account to preserve squad & leagues
    const guestUserId = await resolveExistingGuestUserId();
    if (guestUserId) {
      const guestUser = await prisma.user.findUnique({
        where: { id: guestUserId },
      });

      if (guestUser && !guestUser.telegramId) {
        const isPlaceholderName =
          !guestUser.name || guestUser.name.startsWith("Manager ");
        user = await prisma.user.update({
          where: { id: guestUser.id },
          data: {
            telegramId: normalized.telegramId,
            telegramUsername: normalized.username,
            ...(isPlaceholderName ? { name: normalized.displayName } : {}),
            ...(normalized.photoUrl && !guestUser.image
              ? { image: normalized.photoUrl }
              : {}),
          },
        });
      }
    }

    // 3. Otherwise provision or upsert a User by synthetic email
    if (!user) {
      user = await prisma.user.upsert({
        where: { email: normalized.syntheticEmail },
        update: {
          telegramId: normalized.telegramId,
          telegramUsername: normalized.username,
          name: normalized.displayName,
          ...(normalized.photoUrl ? { image: normalized.photoUrl } : {}),
        },
        create: {
          email: normalized.syntheticEmail,
          telegramId: normalized.telegramId,
          telegramUsername: normalized.username,
          name: normalized.displayName,
          image: normalized.photoUrl,
        },
      });
    }
  }

  // Upsert linked OAuth Account row
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "telegram",
        providerAccountId: normalized.telegramId,
      },
    },
    update: {
      userId: user.id,
    },
    create: {
      userId: user.id,
      type: "oauth",
      provider: "telegram",
      providerAccountId: normalized.telegramId,
    },
  });

  // Issue NextAuth JWT token & signed manager session cookie
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "kpl-fantasy-session-hmac-key";
  const origin = resolveRequestOrigin(request);
  const isSecure = origin.startsWith("https://");
  const authCookieName = isSecure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const jwtToken = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
    },
    secret,
    salt: authCookieName,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const cookieStore = await cookies();

  cookieStore.set(authCookieName, jwtToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  cookieStore.set(MANAGER_SESSION_COOKIE, signUserId(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return {
    ok: true as const,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
    },
  };
}
