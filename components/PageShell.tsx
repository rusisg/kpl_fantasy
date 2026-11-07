"use client";

import { useCallback, useEffect } from "react";
import Navbar from "./Navbar";
import MobileTabBar from "./MobileTabBar";
import { useSquadStore } from "../store/useSquadStore";
import { useTranslation } from "../lib/i18n";
import { IconChevronLeft, IconChevronRight } from "./Icons";

export function KffAttributionFooter() {
  const { t } = useTranslation();
  return (
    <footer className="max-w-[1400px] mx-auto px-4 md:px-8 pb-24 lg:pb-8 pt-4">
      <div className="card px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-center sm:text-left">
          <span>{t("footer.attributionPrefix")}</span>
          <a
            href="https://kffleague.kz"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-accent-text hover:underline transition-colors"
          >
            kffleague.kz
          </a>
          <span className="text-line-strong">•</span>
          <span className="text-ink-2 font-medium">
            {t("footer.attributionRequired")}:{" "}
            <a
              href="https://kffleague.kz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text hover:underline"
            >
              https://kffleague.kz
            </a>
            .
          </span>
        </div>
        <a
          href="https://kffleague.kz"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-bold text-[11px] transition-colors"
        >
          kffleague.kz ↗
        </a>
      </div>
    </footer>
  );
}

export function useManagerContext(): void {
  const { setUserProfile, setActiveGameweek, loadSquadFromApi } = useSquadStore();

  const hydrate = useCallback(async () => {
    try {
      const res = await fetch("/api/squad");
      const json = await res.json();
      if (json.success) {
        if (json.user) setUserProfile(json.user);
        if (json.gameweek) setActiveGameweek(json.gameweek);
        if (json.data) loadSquadFromApi(json.data);
      }
    } catch (err) {
      console.error("Failed to hydrate manager context:", err);
    }
  }, [loadSquadFromApi, setActiveGameweek, setUserProfile]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);
}

interface PageShellProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageShell({ icon, title, subtitle, aside, children }: PageShellProps) {
  useManagerContext();

  return (
    <div className="min-h-screen text-ink flex flex-col transition-colors">
      <Navbar />
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-3 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
        <header className="card p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-surface-2 border border-line-strong flex items-center justify-center text-accent shrink-0 shadow-lg shadow-accent/10">
              {icon}
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-black text-2xl sm:text-3xl text-ink tracking-tight truncate">
                {title}
              </h1>
              <p className="kicker text-accent-text mt-0.5 truncate">
                {subtitle}
              </p>
            </div>
          </div>
          {aside && <div className="self-stretch sm:self-start md:self-auto shrink-0">{aside}</div>}
        </header>
        {children}
      </main>
      <KffAttributionFooter />
      <MobileTabBar />
    </div>
  );
}

interface GameweekStepperProps {
  gameweekId: number;
  min: number;
  max: number;
  onChange: (id: number) => void;
  disabled?: boolean;
}

export function GameweekStepper({ gameweekId, min, max, onChange, disabled }: GameweekStepperProps) {
  const { t } = useTranslation();
  const btn =
    "w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-surface-2 border border-line text-ink font-black hover:border-accent disabled:opacity-30 disabled:hover:border-line transition-colors flex items-center justify-center shrink-0";
  return (
    <div className="flex items-center justify-between sm:justify-center gap-3 bg-surface p-2 rounded-2xl border border-line">
      <button
        type="button"
        aria-label={t("common.prev")}
        className={btn}
        disabled={disabled || gameweekId <= min}
        onClick={() => onChange(gameweekId - 1)}
      >
        <IconChevronLeft className="w-4 h-4" />
      </button>
      <div className="text-center min-w-[90px] sm:min-w-[110px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
          {t("points.colGw")}
        </div>
        <div className="text-xl sm:text-2xl font-display font-black text-ink tabular-nums">
          {gameweekId}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("common.next")}
        className={btn}
        disabled={disabled || gameweekId >= max}
        onClick={() => onChange(gameweekId + 1)}
      >
        <IconChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
