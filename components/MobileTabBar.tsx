"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconPitch, IconChart, IconCalendar, IconTrophy } from "./Icons";
import { useTranslation } from "../lib/i18n";

export default function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const tabs = [
    { href: "/squad", label: t("nav.squad"), icon: IconPitch },
    { href: "/points", label: t("nav.points"), icon: IconChart },
    { href: "/fixtures", label: t("nav.fixtures"), icon: IconCalendar },
    { href: "/leagues", label: t("nav.leagues"), icon: IconTrophy },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-surface/95 backdrop-blur-lg border-t border-line pb-safe transition-colors shadow-2xl"
    >
      <div className="grid grid-cols-4 h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 text-center relative py-1 transition-colors select-none ${
                isActive ? "text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-tight truncate max-w-[72px] leading-tight">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

