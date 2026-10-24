import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "../auth";
import { prisma } from "./prisma";

const MANAGER_SESSION_COOKIE = "kpl_manager_session";

function getSigningSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "kpl-fantasy-session-hmac-key"
  );
}

function signUserId(userId: string): string {
  const sig = createHmac("sha256", getSigningSecret())
    .update(userId)
    .digest("hex");
  return `${userId}.${sig}`;
}

function verifySignedToken(token: string): string | null {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex <= 0) return null;
  const userId = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  const expectedSig = createHmac("sha256", getSigningSecret())
    .update(userId)
    .digest("hex");
  return providedSig === expectedSig ? userId : null;
}

/**
 * Resolves the authenticated User record from PostgreSQL.
 * 1. Uses NextAuth session (`await auth()`) when OAuth/Credentials sign-in is active.
 * 2. Otherwise uses a cryptographically signed HttpOnly manager cookie backed by a real
 *    PostgreSQL `User` row — never a hardcoded static user ID or client-supplied ID.
 */
export async function resolveAuthenticatedUser() {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const existing = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          favoriteClub: {
            select: { id: true, name: true, shortName: true, logoUrl: true },
          },
        },
      });
      if (existing) return existing;
    }
  } catch {
    // NextAuth session unavailable; continue to signed manager cookie
  }

  const cookieStore = await cookies();
  const rawToken = cookieStore.get(MANAGER_SESSION_COOKIE)?.value;
  const verifiedUserId = rawToken ? verifySignedToken(rawToken) : null;

  if (verifiedUserId) {
    const existing = await prisma.user.findUnique({
      where: { id: verifiedUserId },
      include: {
        favoriteClub: {
          select: { id: true, name: true, shortName: true, logoUrl: true },
        },
      },
    });
    if (existing) {
      return existing;
    }
  }

  // Provision a fresh database-backed User record and set the signed HttpOnly session cookie
  const uniqueSuffix = randomBytes(6).toString("hex");
  const createdUser = await prisma.user.create({
    data: {
      email: `manager_${uniqueSuffix}@kplfantasy.kz`,
      name: `Manager ${uniqueSuffix.slice(0, 4).toUpperCase()}`,
    },
    include: {
      favoriteClub: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
    },
  });

  try {
    cookieStore.set(MANAGER_SESSION_COOKIE, signUserId(createdUser.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // Cookie store may be read-only in certain RSC render contexts
  }

  return createdUser;
}

export async function resolveAuthenticatedUserId(): Promise<string | null> {
  const user = await resolveAuthenticatedUser();
  return user?.id ?? null;
}
