import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized() {
      // TEMPORARY BYPASS: Allows UI testing without Google OAuth setup in development
      return true;
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
  providers: [], // OAuth and Email providers will be configured here
} satisfies NextAuthConfig;
