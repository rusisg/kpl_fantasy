import crypto from "node:crypto";

export const TELEGRAM_AUTH_MAX_AGE_SECONDS = 86_400; // 24 hours
const CLOCK_SKEW_TOLERANCE_SECONDS = 300; // 5 minutes

export interface NormalizedTelegramUser {
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  authDate: number;
  displayName: string;
  syntheticEmail: string;
}

/**
 * Builds the canonical Telegram `data-check-string` by:
 * 1. Excluding `hash` and empty/undefined values.
 * 2. Sorting remaining keys alphabetically (`a..z`).
 * 3. Joining as `key=value` separated by `\n`.
 */
export function buildTelegramDataCheckString(
  data: Record<string, string | number | undefined | null>
): string {
  const entries: [string, string][] = [];

  for (const [key, rawValue] of Object.entries(data)) {
    if (key === "hash" || rawValue === undefined || rawValue === null) {
      continue;
    }
    const strVal = String(rawValue);
    if (strVal.length === 0) {
      continue;
    }
    entries.push([key, strVal]);
  }

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("\n");
}

/**
 * Computes the expected lowercase hex HMAC-SHA-256 signature for a Telegram Login payload.
 */
export function computeTelegramAuthHash(
  data: Record<string, string | number | undefined | null>,
  botToken: string
): string {
  const dataCheckString = buildTelegramDataCheckString(data);
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  return crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
}

/**
 * Verifies the authenticity and freshness of a Telegram Login Widget payload:
 * 1. Extracts `hash` from `data`.
 * 2. Sorts remaining key-value pairs alphabetically as `key=value\n`.
 * 3. Computes secret key `SHA256(botToken)`.
 * 4. Calculates `HMAC-SHA256(data_check_string, secret_key)`.
 * 5. Compares calculated hex against received `hash` via `crypto.timingSafeEqual`.
 * 6. Verifies `auth_date` is within the last 24 hours to prevent replay attacks.
 */
export function verifyTelegramAuthData(
  data: Record<string, string | number>,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  const trimmedToken = botToken?.trim();
  if (!trimmedToken || !data || typeof data !== "object") {
    return false;
  }

  const receivedHashRaw = data.hash;
  if (
    receivedHashRaw === undefined ||
    receivedHashRaw === null ||
    String(receivedHashRaw).trim().length === 0
  ) {
    return false;
  }

  const receivedHash = String(receivedHashRaw).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) {
    return false;
  }

  const idStr = data.id !== undefined ? String(data.id).trim() : "";
  if (!idStr) {
    return false;
  }

  const authDateSec = Number(data.auth_date);
  if (!Number.isFinite(authDateSec) || authDateSec <= 0) {
    return false;
  }

  const ageSeconds = nowSec - authDateSec;
  if (
    ageSeconds > TELEGRAM_AUTH_MAX_AGE_SECONDS ||
    ageSeconds < -CLOCK_SKEW_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expectedHash = computeTelegramAuthHash(data, trimmedToken);

  const expectedBuf = Buffer.from(expectedHash, "hex");
  const receivedBuf = Buffer.from(receivedHash, "hex");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Normalizes a verified Telegram payload into user profile attributes.
 */
export function normalizeTelegramUser(
  data: Record<string, string | number>
): NormalizedTelegramUser {
  const telegramId = String(data.id).trim();
  const firstName =
    data.first_name !== undefined ? String(data.first_name).trim() : "";
  const lastNameRaw =
    data.last_name !== undefined ? String(data.last_name).trim() : "";
  const usernameRaw =
    data.username !== undefined ? String(data.username).trim() : "";
  const photoUrlRaw =
    data.photo_url !== undefined ? String(data.photo_url).trim() : "";
  const authDate = Number(data.auth_date);

  const fullName = [firstName, lastNameRaw].filter(Boolean).join(" ").trim();
  const displayName =
    fullName || usernameRaw || `Manager #${telegramId.slice(-4)}`;

  return {
    telegramId,
    firstName: firstName || displayName,
    lastName: lastNameRaw || null,
    username: usernameRaw || null,
    photoUrl: photoUrlRaw || null,
    authDate,
    displayName,
    syntheticEmail: `${telegramId}@telegram.kplfantasy.kz`,
  };
}
