import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // TEMPORARY BYPASS: Allows UI testing without Google OAuth setup
      return true;
    },
  },
  providers: [], // OAuth and Email providers will be configured here
} satisfies NextAuthConfig;