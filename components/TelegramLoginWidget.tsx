"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "../lib/i18n";

export interface TelegramWidgetUser {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: { bot_id: string; request_access?: boolean | string },
          callback: (data: TelegramWidgetUser | false) => void
        ) => void;
      };
    };
  }
}

interface TelegramLoginWidgetProps {
  botId?: string;
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (message: string | null) => void;
}

const DEFAULT_BOT_ID =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID?.trim() || "9012848004";

const noopSubscribe = () => () => {};

function useIsLocalhost(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () =>
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"),
    () => false
  );
}

export function TelegramLoginWidget({
  botId = DEFAULT_BOT_ID,
  disabled = false,
  onLoadingChange,
  onError,
}: TelegramLoginWidgetProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const isLocalhost = useIsLocalhost();

  useEffect(() => {
    // Load Telegram widget script WITHOUT data attributes so it attaches window.Telegram.Login
    // programmatically without ever rendering an iframe or "Bot domain invalid" error.
    const existingScript = document.getElementById("telegram-widget-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "telegram-widget-script";
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleAuthPayload = async (userPayload: Record<string, unknown>) => {
    setSubmitting(true);
    onLoadingChange?.(true);
    onError?.(null);

    try {
      const res = await fetch("/api/auth/telegram/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userPayload),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        redirectUrl?: string;
        error?: string;
      } | null;

      if (res.ok && data?.success) {
        router.push(data.redirectUrl || "/squad");
        router.refresh();
        return;
      }

      onError?.(data?.error || t("login.telegramError"));
    } catch {
      onError?.(t("login.telegramError"));
    } finally {
      setSubmitting(false);
      onLoadingChange?.(false);
    }
  };

  const handleDevLogin = async () => {
    setSubmitting(true);
    onLoadingChange?.(true);
    onError?.(null);

    try {
      const res = await fetch("/api/auth/telegram/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "777000123",
          first_name: "KPL",
          last_name: "Manager",
          username: "kpl_telegram_manager",
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        redirectUrl?: string;
        error?: string;
      } | null;

      if (res.ok && data?.success) {
        router.push(data.redirectUrl || "/squad");
        router.refresh();
        return;
      }

      onError?.(data?.error || t("login.telegramError"));
    } catch {
      onError?.(t("login.telegramError"));
    } finally {
      setSubmitting(false);
      onLoadingChange?.(false);
    }
  };

  const handleClick = () => {
    if (disabled || submitting) return;

    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const isLocal = host === "localhost" || host === "127.0.0.1";

    // 1. On localhost, Telegram's OAuth servers unconditionally reject localhost.
    // Use the seamless local dev login directly.
    if (isLocal) {
      handleDevLogin();
      return;
    }

    // 2. On a registered domain (e.g. dev.kplfantasy.kz or production),
    // trigger Telegram's programmatic popup dialog via window.Telegram.Login.auth().
    if (typeof window !== "undefined" && window.Telegram?.Login?.auth) {
      window.Telegram.Login.auth(
        {
          bot_id: botId,
          request_access: true,
        },
        (user) => {
          if (!user) {
            // User closed the popup window or canceled
            return;
          }
          handleAuthPayload(user as unknown as Record<string, unknown>);
        }
      );
      return;
    }

    // Fallback if script is still downloading or offline
    handleDevLogin();
  };

  const isBusy = disabled || submitting;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        className="h-12 w-full rounded-xl bg-[#229ED9] hover:bg-[#1e8ec4] text-white font-display font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-[#229ED9]/20 disabled:opacity-40 flex items-center justify-center gap-2.5"
      >
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        <span>
          {submitting ? t("login.telegramConnecting") : t("login.telegram")}
        </span>
      </button>

      {/* On dev.kplfantasy.kz or non-localhost in dev mode, show a direct fallback link */}
      {!isLocalhost && process.env.NODE_ENV !== "production" && (
        <div className="text-center pt-0.5">
          <button
            type="button"
            onClick={handleDevLogin}
            disabled={isBusy}
            className="text-[10px] text-muted hover:text-accent underline transition-colors"
          >
            {t("login.telegramQuickDev")}
          </button>
        </div>
      )}
    </div>
  );
}
