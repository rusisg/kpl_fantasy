import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "kpl_admin_session";
const ADMIN_TOKEN_PAYLOAD = "kpl-fantasy-admin-authorized-v1";

function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a raw admin secret passcode against the configured ADMIN_SECRET.
 */
export function verifyRawAdminSecret(
  providedSecret: string | null | undefined,
  configuredSecret: string | undefined = process.env.ADMIN_SECRET
): boolean {
  if (!configuredSecret || !providedSecret) {
    return false;
  }
  const cleanConfigured = configuredSecret.trim();
  const cleanProvided = providedSecret.trim();
  if (!cleanConfigured || !cleanProvided) {
    return false;
  }
  return safeCompareStrings(cleanConfigured, cleanProvided);
}

/**
 * Creates an HMAC-SHA256 signed session token derived from ADMIN_SECRET
 * for safe storage in an HttpOnly cookie.
 */
export function createAdminSessionToken(
  configuredSecret: string | undefined = process.env.ADMIN_SECRET
): string {
  const cleanConfigured = (configuredSecret ?? "").trim();
  if (!cleanConfigured) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const sig = createHmac("sha256", cleanConfigured)
    .update(ADMIN_TOKEN_PAYLOAD)
    .digest("hex");
  return `v1.${sig}`;
}

/**
 * Verifies an admin session token (either the signed cookie token `v1.<hmac>`
 * or a direct match with the raw ADMIN_SECRET).
 */
export function verifyAdminSessionToken(
  token: string | null | undefined,
  configuredSecret: string | undefined = process.env.ADMIN_SECRET
): boolean {
  if (!configuredSecret || !token) {
    return false;
  }
  const cleanConfigured = configuredSecret.trim();
  const cleanToken = token.trim();
  if (!cleanConfigured || !cleanToken) {
    return false;
  }

  if (cleanToken.startsWith("v1.")) {
    const expected = createAdminSessionToken(cleanConfigured);
    return safeCompareStrings(expected, cleanToken);
  }

  return safeCompareStrings(cleanConfigured, cleanToken);
}

function extractCookieFromHeader(
  cookieHeader: string | null,
  cookieName: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === cookieName) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Verifies whether an incoming Request is authorized as Admin via:
 * 1. `x-admin-secret` header
 * 2. `Authorization: Bearer <secret>` header
 * 3. `kpl_admin_session` HttpOnly cookie
 */
export async function verifyAdminRequest(request: Request): Promise<boolean> {
  const configuredSecret = process.env.ADMIN_SECRET;
  if (!configuredSecret) {
    return false;
  }

  // 1. Check x-admin-secret header
  const headerSecret = request.headers.get("x-admin-secret");
  if (
    headerSecret &&
    (verifyRawAdminSecret(headerSecret, configuredSecret) ||
      verifyAdminSessionToken(headerSecret, configuredSecret))
  ) {
    return true;
  }

  // 2. Check Authorization: Bearer header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    if (
      verifyRawAdminSecret(bearerToken, configuredSecret) ||
      verifyAdminSessionToken(bearerToken, configuredSecret)
    ) {
      return true;
    }
  }

  // 3. Check Cookie header on Request directly
  const rawCookieHeader = request.headers.get("cookie");
  const headerCookieToken = extractCookieFromHeader(
    rawCookieHeader,
    ADMIN_SESSION_COOKIE
  );
  if (
    headerCookieToken &&
    verifyAdminSessionToken(headerCookieToken, configuredSecret)
  ) {
    return true;
  }

  // 4. Fallback to Next.js cookies() store
  try {
    const cookieStore = await cookies();
    const storeToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    if (storeToken && verifyAdminSessionToken(storeToken, configuredSecret)) {
      return true;
    }
  } catch {
    // Outside request context
  }

  return false;
}
