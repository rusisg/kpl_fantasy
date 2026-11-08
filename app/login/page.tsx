"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useTranslation, LOCALES, LOCALE_LABELS } from "../../lib/i18n";
import { IconSun, IconMoon } from "../../components/Icons";
import { TelegramLoginWidget } from "../../components/TelegramLoginWidget";

export default function LoginPage() {
  const { locale, setLocale, theme, toggleTheme, t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await signIn("google", { callbackUrl: "/squad" });
    } catch {
      setErrorMessage(t("login.error"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-ink relative">
      {/* Top right language & theme bar */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-2 rounded-xl bg-surface-2 border border-line text-ink hover:bg-surface-3 transition-colors"
        >
          {theme === "light" ? (
            <IconMoon className="w-4 h-4" />
          ) : (
            <IconSun className="w-4 h-4" />
          )}
        </button>

        <div className="flex items-center bg-surface-2 p-0.5 rounded-xl border border-line">
          {LOCALES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLocale(lang)}
              className={`px-2 py-1 rounded-lg text-[11px] font-display font-black tracking-wider transition-all ${
                locale === lang
                  ? "bg-accent text-on-accent shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {LOCALE_LABELS[lang]}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-6 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-emerald-400 p-[1px] shadow-lg shadow-accent/20">
            <div className="w-full h-full bg-canvas rounded-[15px] flex items-center justify-center font-display font-black text-accent text-xl tracking-tighter">
              KPL
            </div>
          </div>
          <div>
            <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-ink uppercase">
              {t("login.title")}
            </h1>
            <p className="text-xs sm:text-sm text-muted mt-1 max-w-sm">
              {t("login.subtitle")}
            </p>
          </div>
        </div>

        {/* Feature bullets */}
        <div className="bg-surface-2 rounded-2xl p-4 border border-line space-y-2 text-xs font-medium text-ink-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>{t("login.feature1")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>{t("login.feature2")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>{t("login.feature3")}</span>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-danger/15 border border-danger/30 text-danger-text text-xs font-bold text-center"
          >
            {errorMessage}
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="h-12 w-full rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-accent/25 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <span>{loading ? t("login.redirecting") : t("login.google")}</span>
          </button>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-muted">
              <div className="h-px flex-1 bg-line" />
              <span>{t("login.telegramOr")}</span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <TelegramLoginWidget
              disabled={loading}
              onLoadingChange={setLoading}
              onError={setErrorMessage}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-line text-center space-y-2">
          <Link
            href="/squad"
            className="block text-xs font-display font-bold text-muted hover:text-accent uppercase tracking-wider transition-colors"
          >
            ← {t("notFound.back")}
          </Link>
          <p className="text-[10px] text-muted leading-relaxed">
            {t("login.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
}
