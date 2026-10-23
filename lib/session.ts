import { auth } from "../auth";

const DEV_FALLBACK_USER_ID = "dev_manager_local";

/**
 * Resolves the active user's ID exclusively from the server-side Auth.js session.
 * Never accepts a client-supplied `userId` from query parameters or JSON payloads.
 *
 * In non-production environments (while OAuth providers are unconfigured), falls back
 * to a single deterministic server-side development user ID. In production, strictly
 * returns `null` when unauthenticated.
 */
export async function resolveAuthenticatedUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      return session.user.id;
    }
  } catch {
    // Session decoding failed; fall through to environment policy
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_FALLBACK_USER_ID;
  }

  return null;
}
