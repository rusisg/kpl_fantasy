import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./lib/prisma";
import { authConfig } from "./auth.config";
import {
  normalizeTelegramUser,
  verifyTelegramAuthData,
} from "./lib/telegram-auth";

const telegramProvider = Credentials({
  id: "telegram",
  name: "Telegram",
  credentials: {
    id: { label: "Telegram ID", type: "text" },
    first_name: { label: "First Name", type: "text" },
    last_name: { label: "Last Name", type: "text" },
    username: { label: "Username", type: "text" },
    photo_url: { label: "Photo URL", type: "text" },
    auth_date: { label: "Auth Date", type: "text" },
    hash: { label: "Hash", type: "text" },
  },
  async authorize(credentials) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !credentials) {
      return null;
    }

    const payload: Record<string, string> = {};
    for (const key of [
      "id",
      "first_name",
      "last_name",
      "username",
      "photo_url",
      "auth_date",
      "hash",
    ] as const) {
      const val = credentials[key];
      if (val !== undefined && val !== null && String(val).length > 0) {
        payload[key] = String(val);
      }
    }

    if (!verifyTelegramAuthData(payload, botToken)) {
      return null;
    }

    const normalized = normalizeTelegramUser(payload);

    let user = await prisma.user.findUnique({
      where: { telegramId: normalized.telegramId },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: normalized.displayName,
          telegramUsername: normalized.username,
          ...(normalized.photoUrl ? { image: normalized.photoUrl } : {}),
        },
      });
    } else {
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

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  },
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [...authConfig.providers, telegramProvider],
});
