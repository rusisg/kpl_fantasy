import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const isGoogleOAuthConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

export const isTelegramAuthConfigured = Boolean(
  process.env.TELEGRAM_BOT_TOKEN && process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
);

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl, headers } = request;
      // Keep guest session fallback only for local development/testing when OAuth env vars are not set
      if (!isGoogleOAuthConfigured && !isTelegramAuthConfigured) {
        return true;
      }

      const isLoggedIn = Boolean(auth?.user);
      const isOnLoginPage = nextUrl.pathname.startsWith("/login");
      const isOnAdminPage = nextUrl.pathname.startsWith("/admin");
      const host =
        headers.get("x-forwarded-host") ?? headers.get("host") ?? nextUrl.host;
      const proto =
        headers.get("x-forwarded-proto") ??
        nextUrl.protocol.replace(":", "") ??
        "http";
      const currentOrigin = `${proto}://${host}`;

      if (isOnAdminPage) {
        return true;
      }

      if (isOnLoginPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/squad", currentOrigin));
        }
        return true;
      }

      if (!isLoggedIn) {
        const loginUrl = new URL("/login", currentOrigin);
        loginUrl.searchParams.set(
          "callbackUrl",
          `${currentOrigin}${nextUrl.pathname}${nextUrl.search}`
        );
        return Response.redirect(loginUrl);
      }

      return true;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      try {
        const parsed = new URL(url);
        if (
          parsed.origin === baseUrl ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname.endsWith("kplfantasy.kz")
        ) {
          return url;
        }
      } catch {
        // Fallback to baseUrl
      }
      return baseUrl;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  providers: isGoogleOAuthConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          allowDangerousEmailAccountLinking: true,
          checks: ["none"],
        }),
      ]
    : [],
} satisfies NextAuthConfig;
