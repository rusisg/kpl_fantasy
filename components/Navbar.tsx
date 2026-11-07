"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSquadStore } from "../store/useSquadStore";
import { LOCALE_LABELS, LOCALES, useTranslation, formatCountdown } from "../lib/i18n";
import { IconSun, IconMoon } from "./Icons";
import ClubCrest from "./ClubCrest";

export default function Navbar() {
  const pathname = usePathname();
  const { squadName, userProfile, activeGameweek, squadTotalPoints } = useSquadStore();
  const { locale, setLocale, theme, toggleTheme, t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { href: "/squad", label: t("nav.squad") },
    { href: "/points", label: t("nav.points") },
    { href: "/fixtures", label: t("nav.fixtures") },
    { href: "/leagues", label: t("nav.leagues") },
  ];

  const deadlineMs = activeGameweek?.deadline ? new Date(activeGameweek.deadline).getTime() : 0;
  const isLocked = Boolean(activeGameweek?.isLocked || (deadlineMs > 0 && deadlineMs <= now));
  const msRemaining = Math.max(0, deadlineMs - now);

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-line transition-colors">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand + Desktop Navigation */}
          <div className="flex items-center gap-3 lg:gap-6 min-w-0">
            <Link href="/squad" className="flex items-center gap-2.5 shrink-0 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-emerald-400 p-[1px] shadow-lg shadow-accent/20">
                <div className="w-full h-full bg-canvas rounded-[11px] flex items-center justify-center font-display font-black text-accent text-sm tracking-tighter group-hover:scale-105 transition-transform">
                  KPL
                </div>
              </div>
              <div className="hidden sm:block leading-none">
                <span className="font-display font-black text-base lg:text-lg tracking-tight text-ink uppercase">
                  KPL Fantasy
                </span>
                <span className="block text-[9px] font-bold text-accent tracking-widest uppercase mt-0.5">
                  {t("nav.subtitle")}
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden lg:flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-bold tracking-wider uppercase transition-all select-none ${
                      isActive
                        ? "bg-accent text-on-accent shadow-sm shadow-accent/30 font-black"
                        : "text-muted hover:text-ink hover:bg-surface-3"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls: Gameweek Deadline, Theme, Language, Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {activeGameweek && (
              <div
                className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold tabular-nums whitespace-nowrap ${
                  isLocked
                    ? "bg-warning/10 border-warning/30 text-warning-text"
                    : "bg-accent/10 border-accent/30 text-accent-text"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLocked ? "bg-warning" : "bg-accent animate-pulse"
                  }`}
                />
                <span className="font-display font-black uppercase tracking-wider">
                  {t("nav.gwShort", { id: activeGameweek.id })}
                </span>
                <span className="text-muted">•</span>
                <span>
                  {isLocked ? t("nav.locked") : t("nav.locksIn", { time: formatCountdown(t, msRemaining) })}
                </span>
              </div>
            )}

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === "light" ? t("theme.dark") : t("theme.light")}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink transition-colors flex items-center gap-1.5"
            >
              {theme === "light" ? <IconMoon className="w-4 h-4" /> : <IconSun className="w-4 h-4" />}
              <span className="hidden xl:inline text-xs font-bold">
                {theme === "light" ? t("theme.dark") : t("theme.light")}
              </span>
            </button>

            {/* Language Switcher (EN / RU / KZ) */}
            <div
              role="group"
              aria-label="Language selector"
              className="flex items-center bg-surface-2 p-0.5 rounded-xl border border-line"
            >
              {LOCALES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLocale(lang)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-display font-black tracking-wider transition-all select-none ${
                    locale === lang
                      ? "bg-accent text-on-accent shadow-sm shadow-accent/20"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {LOCALE_LABELS[lang]}
                </button>
              ))}
            </div>

            {/* Manager Points Summary Card */}
            {userProfile && (
              <div className="hidden sm:flex items-center gap-2.5 bg-surface-2 border border-line px-3 py-1.5 rounded-xl">
                {userProfile.favoriteClub && (
                  <ClubCrest
                    name={userProfile.favoriteClub.name}
                    shortName={userProfile.favoriteClub.shortName}
                    logoUrl={userProfile.favoriteClub.logoUrl}
                    size="sm"
                  />
                )}
                <div className="text-right leading-tight">
                  <div className="text-xs font-black text-ink truncate max-w-[120px] lg:max-w-[150px]">
                    {squadName || userProfile.name || t("nav.newManager")}
                  </div>
                  <div className="text-[10px] font-bold text-muted tabular-nums">
                    <span className="text-accent-text font-black">{squadTotalPoints}</span> {t("nav.pts")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
