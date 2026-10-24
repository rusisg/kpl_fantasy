"use client";

import { useState } from "react";
import { ClubInfo, SquadApiResponse, UserProfileInfo } from "../lib/types";

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
  const [managerName, setManagerName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [favoriteClubId, setFavoriteClubId] = useState("");
  const [strategy, setStrategy] = useState<"BALANCED" | "PREMIUM_ATTACK">(
    "BALANCED"
  );
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
        setErrorMessage(data.error || "Failed to initialize squad.");
        setLoading(false);
        return;
      }

      onComplete?.({
        squad: data.data ?? null,
        user: data.user ?? null,
      });
      onClose();
    } catch {
      setErrorMessage("Network error while creating your squad.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg shadow-2xl rounded-3xl overflow-hidden">
        {/* Header Graphic */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-8 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)",
            }}
          />
          <h2
            id="onboarding-modal-title"
            className="text-3xl font-extrabold text-white tracking-tight relative z-10"
          >
            Welcome Manager
          </h2>
          <p className="text-emerald-50 mt-2 text-sm font-medium relative z-10">
            Set up your profile and auto-draft your initial 15-man KPL squad
          </p>
        </div>

        <div className="p-8">
          <form onSubmit={handleComplete} className="space-y-5">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold">
                {errorMessage}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="managerName"
                  className="text-sm font-bold text-slate-300"
                >
                  Manager Name
                </label>
                <input
                  id="managerName"
                  type="text"
                  required
                  placeholder="e.g. Samat Smakov"
                  className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all placeholder:text-slate-600 font-medium text-sm"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="teamName"
                  className="text-sm font-bold text-slate-300"
                >
                  Squad Name
                </label>
                <input
                  id="teamName"
                  type="text"
                  required
                  placeholder="e.g. Almaty All-Stars"
                  className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all placeholder:text-slate-600 font-medium text-sm"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="favoriteClub"
                className="text-sm font-bold text-slate-300"
              >
                Favorite KPL Club
              </label>
              <select
                id="favoriteClub"
                className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all appearance-none font-medium text-sm"
                value={favoriteClubId}
                onChange={(e) => setFavoriteClubId(e.target.value)}
              >
                <option value="">No club preference</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name} ({club.shortName})
                  </option>
                ))}
              </select>
            </div>

            {favoriteClubId && (
              <label className="flex items-center gap-3 text-xs font-bold text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={maximizeFavorite}
                  onChange={(e) => setMaximizeFavorite(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                />
                Include up to 3 players from my favorite club in initial draft
              </label>
            )}

            <div className="space-y-3 pt-1">
              <span className="text-sm font-bold text-slate-300">
                Autopick Strategy
              </span>

              <div className="grid grid-cols-2 gap-4">
                <label
                  className={`flex flex-col p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                    strategy === "BALANCED"
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950 hover:border-slate-700"
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
                  <div className="text-sm font-bold text-white mb-1">
                    Balanced
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    Even budget across the pitch.
                  </div>
                </label>

                <label
                  className={`flex flex-col p-4 border-2 rounded-2xl cursor-pointer transition-all ${
                    strategy === "PREMIUM_ATTACK"
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950 hover:border-slate-700"
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
                  <div className="text-sm font-bold text-white mb-1">
                    Heavy Attack
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    Focus funds on goalscorers.
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-5 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors"
              >
                Build Manually
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-black text-base py-4 rounded-xl hover:from-emerald-400 hover:to-green-400 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50"
              >
                {loading ? "Drafting 15 Players..." : "Auto-Draft & Enter Game"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
