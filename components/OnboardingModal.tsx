"use client";

import { useState } from "react";
import { ClubInfo, SquadApiResponse, UserProfileInfo } from "../lib/types";
import { useTranslation } from "../lib/i18n";
import ClubCrest from "./ClubCrest";

interface OnboardingModalProps {
  isOpen: boolean;
  clubs: ClubInfo[];
  onClose: () => void;
  onComplete?: (payload: {
    squad: SquadApiResponse | null;
    user: UserProfileInfo | null;
  }) => void;
}

export default function OnboardingModal({
  isOpen,
  clubs,
  onClose,
  onComplete,
}: OnboardingModalProps) {
  const { t } = useTranslation();

  const [managerName, setManagerName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [favoriteClubId, setFavoriteClubId] = useState("");
  const [strategy, setStrategy] = useState<"BALANCED" | "PREMIUM_ATTACK">("BALANCED");
  const [maximizeFavorite, setMaximizeFavorite] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerName: managerName.trim() || undefined,
          teamName: teamName.trim(),
          favoriteClubId: favoriteClubId || null,
          strategy,
          maximizeFavorite: Boolean(favoriteClubId && maximizeFavorite),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || t("common.genericError"));
        setLoading(false);
        return;
      }

      onComplete?.({
        squad: data.data ?? null,
        user: data.user ?? null,
      });
      onClose();
    } catch {
      setErrorMessage(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  };

  const selectedClub = clubs.find((c) => c.id === favoriteClubId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-canvas/80 backdrop-blur-md animate-fade-in"
    >
      <div className="w-full max-w-lg bg-surface border border-line rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-pop-in">
        {/* Header Graphic */}
        <div className="pitch p-6 sm:p-7 text-center relative border-b border-line">
          <div className="relative z-10 space-y-1">
            <span className="kicker text-accent-text">KPL Fantasy</span>
            <h2
              id="onboarding-modal-title"
              className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight"
            >
              {t("onb.title")}
            </h2>
            <p className="text-white/80 text-xs sm:text-sm font-medium max-w-md mx-auto">
              {t("onb.subtitle")}
            </p>
          </div>
        </div>

        <form onSubmit={handleComplete} className="p-5 sm:p-7 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-danger/15 border border-danger/30 text-danger-text text-xs font-bold">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="managerName" className="text-xs font-display font-bold uppercase tracking-wider text-muted">
                {t("onb.managerName")}
              </label>
              <input
                id="managerName"
                type="text"
                required
                placeholder={t("onb.managerPlaceholder")}
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full bg-surface-2 border border-line text-ink text-sm rounded-xl px-4 py-2.5 focus:border-accent focus:outline-none transition-colors placeholder:text-muted"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="teamName" className="text-xs font-display font-bold uppercase tracking-wider text-muted">
                {t("onb.squadName")}
              </label>
              <input
                id="teamName"
                type="text"
                required
                placeholder={t("onb.squadPlaceholder")}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full bg-surface-2 border border-line text-ink text-sm rounded-xl px-4 py-2.5 focus:border-accent focus:outline-none transition-colors placeholder:text-muted"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="favoriteClub" className="text-xs font-display font-bold uppercase tracking-wider text-muted flex items-center justify-between">
              <span>{t("onb.favClub")}</span>
              {selectedClub && (
                <div className="flex items-center gap-1.5 text-accent-text font-black text-[11px]">
                  <ClubCrest
                    name={selectedClub.name}
                    shortName={selectedClub.shortName}
                    logoUrl={selectedClub.logoUrl}
                    size="xs"
                  />
                  <span>{selectedClub.name}</span>
                </div>
              )}
            </label>
            <select
              id="favoriteClub"
              value={favoriteClubId}
              onChange={(e) => setFavoriteClubId(e.target.value)}
              className="w-full bg-surface-2 border border-line text-ink text-sm rounded-xl px-4 py-2.5 focus:border-accent focus:outline-none transition-colors"
            >
              <option value="">{t("onb.noClub")}</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name} ({club.shortName})
                </option>
              ))}
            </select>
          </div>

          {favoriteClubId && (
            <label className="flex items-center gap-2.5 text-xs font-bold text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={maximizeFavorite}
                onChange={(e) => setMaximizeFavorite(e.target.checked)}
                className="rounded border-line bg-surface-2 text-accent focus:ring-accent"
              />
              <span>{t("onb.maximizeFav")}</span>
            </label>
          )}

          <div className="space-y-2 pt-1">
            <span className="text-xs font-display font-bold uppercase tracking-wider text-muted">
              {t("onb.strategy")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`card p-3 sm:p-4 rounded-2xl cursor-pointer transition-all ${
                  strategy === "BALANCED"
                    ? "border-accent bg-accent/10 shadow-sm"
                    : "hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  value="BALANCED"
                  checked={strategy === "BALANCED"}
                  onChange={() => setStrategy("BALANCED")}
                  className="sr-only"
                />
                <div className="font-display font-black text-sm text-ink">{t("onb.balanced")}</div>
                <div className="text-[11px] text-muted mt-0.5">{t("onb.balancedDesc")}</div>
              </label>

              <label
                className={`card p-3 sm:p-4 rounded-2xl cursor-pointer transition-all ${
                  strategy === "PREMIUM_ATTACK"
                    ? "border-accent bg-accent/10 shadow-sm"
                    : "hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="strategy"
                  value="PREMIUM_ATTACK"
                  checked={strategy === "PREMIUM_ATTACK"}
                  onChange={() => setStrategy("PREMIUM_ATTACK")}
                  className="sr-only"
                />
                <div className="font-display font-black text-sm text-ink">{t("onb.attack")}</div>
                <div className="text-[11px] text-muted mt-0.5">{t("onb.attackDesc")}</div>
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-11 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-bold text-xs uppercase tracking-wider transition-colors select-none"
            >
              {t("onb.manual")}
            </button>
            <button
              type="submit"
              disabled={loading || !teamName.trim()}
              className="h-11 flex-1 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-accent/20 disabled:opacity-40 select-none whitespace-nowrap"
            >
              {loading ? t("onb.drafting") : t("onb.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
