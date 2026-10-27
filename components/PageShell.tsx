"use client";

import { useCallback, useEffect } from "react";
import Navbar from "./Navbar";
import { useSquadStore } from "../store/useSquadStore";
import { useTranslation } from "../lib/i18n";

export function KffAttributionFooter() {
  const { t } = useTranslation();
  return (
    <footer className="max-w-[1400px] mx-auto px-4 md:px-8 pb-8 pt-4">
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-center sm:text-left">
          <span>{t("footer.attributionPrefix")}</span>
          <a
            href="https://kffleague.kz"
            target="_blank"
            rel="noopener noreferrer"
            className="font-black text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
          >
            kffleague.kz
          </a>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300 font-medium">
            При использовании материалов обязательна ссылка на официальный сайт{" "}
            <a
              href="https://kffleague.kz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
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
          className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 font-bold transition-colors"
        >
          kffleague.kz ↗
        </a>
      </div>
    </footer>
  );
}

/**
 * Hydrates the shared Navbar context (manager profile, active gameweek, squad totals)
 * from /api/squad. Used by secondary pages (Fixtures, Points) that don't otherwise
 * load the squad themselves.
 */
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
  icon: string;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageShell({ icon, title, subtitle, aside, children }: PageShellProps) {
  useManagerContext();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      <Navbar />
      <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl shadow-lg flex items-center justify-center border-2 border-emerald-300">
              <span className="text-2xl">{icon}</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white">{title}</h1>
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
          {aside}
        </header>
        {children}
      </div>
      <KffAttributionFooter />
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
  const btn =
    "w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 text-white font-black hover:border-emerald-500 disabled:opacity-30 disabled:hover:border-slate-700 transition-colors";
  return (
    <div className="flex items-center gap-3 bg-slate-950/60 px-4 py-3 rounded-2xl border border-slate-800">
      <button
        type="button"
        aria-label="Previous gameweek"
        className={btn}
        disabled={disabled || gameweekId <= min}
        onClick={() => onChange(gameweekId - 1)}
      >
        ←
      </button>
      <div className="text-center min-w-[110px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gameweek</div>
        <div className="text-2xl font-black text-white">{gameweekId}</div>
      </div>
      <button
        type="button"
        aria-label="Next gameweek"
        className={btn}
        disabled={disabled || gameweekId >= max}
        onClick={() => onChange(gameweekId + 1)}
      >
        →
      </button>
    </div>
  );
}
