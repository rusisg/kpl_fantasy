"use client";

import { useEffect, useState } from "react";
import {
  PlayerMarketItem,
  PlayerSeasonStats,
  PlayerUpcomingFixture,
  SelectedSlotPlayer,
} from "../lib/types";
import { formatClubDisplayName, useTranslation } from "../lib/i18n";
import { formatFixtureOpponentTag, getFdrBadgeClasses } from "../lib/fdr";
import ClubCrest from "./ClubCrest";
import { IconSwap, IconX } from "./Icons";

export type PlayerModalMode = "pitch" | "market";

interface PlayerModalProps {
  player: (PlayerMarketItem & Partial<SelectedSlotPlayer>) | null;
  mode: PlayerModalMode;
  isOpen: boolean;
  onClose: () => void;
  // Pitch actions
  onMakeCaptain?: (playerId: string) => void;
  onMakeViceCaptain?: (playerId: string) => void;
  onStartSwap?: (positionOrder: number) => void;
  onRemove?: (playerId: string) => void;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  // Market actions
  onAddToSquad?: (player: PlayerMarketItem) => void;
  isOwned?: boolean;
  addDisabledReason?: string | null;
  isDeadlineLocked: boolean;
}

const DEFAULT_STATS: PlayerSeasonStats = {
  totalPoints: 0,
  goalsScored: 0,
  assists: 0,
  cleanSheets: 0,
  minutes: 0,
  yellowCards: 0,
  redCards: 0,
  saves: 0,
  bonusPoints: 0,
  appearances: 0,
  form: 0,
};

export default function PlayerModal({
  player,
  mode,
  isOpen,
  onClose,
  onMakeCaptain,
  onMakeViceCaptain,
  onStartSwap,
  onRemove,
  isCaptain = false,
  isViceCaptain = false,
  onAddToSquad,
  isOwned = false,
  addDisabledReason = null,
  isDeadlineLocked,
}: PlayerModalProps) {
  const { t } = useTranslation();
  const [hydratedPlayer, setHydratedPlayer] = useState<PlayerMarketItem | null>(
    null
  );
  const [fetchedForId, setFetchedForId] = useState<string | null>(null);

  const playerId = player?.id ?? null;
  const hasInlineDetails = Boolean(
    player?.upcomingFixtures && player?.stats && player?.selectedByPercent !== undefined
  );

  useEffect(() => {
    if (!isOpen || !playerId || hasInlineDetails) {
      return;
    }

    let cancelled = false;
    fetch(`/api/players?id=${encodeURIComponent(playerId)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items: PlayerMarketItem[]) => {
        if (cancelled) return;
        const match = Array.isArray(items)
          ? items.find((item) => item.id === playerId) ?? items[0] ?? null
          : null;
        setHydratedPlayer(match);
        setFetchedForId(playerId);
      })
      .catch(() => {
        if (!cancelled) {
          setHydratedPlayer(null);
          setFetchedForId(playerId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, playerId, hasInlineDetails]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !player) return null;

  const matchedHydrated =
    hydratedPlayer && hydratedPlayer.id === player.id ? hydratedPlayer : null;
  const loadingDetails =
    !hasInlineDetails && fetchedForId !== player.id;
  const effective = matchedHydrated ? { ...player, ...matchedHydrated } : player;
  const upcomingFixtures: PlayerUpcomingFixture[] =
    effective.upcomingFixtures ?? [];
  const stats: PlayerSeasonStats = {
    ...DEFAULT_STATS,
    totalPoints: effective.totalPoints ?? 0,
    ...(effective.stats ?? {}),
  };
  const selectedByPercent = Number(effective.selectedByPercent ?? 0);
  const displayPrice = Number(
    mode === "pitch"
      ? player.purchasePrice ?? effective.price
      : effective.price
  ).toFixed(1);

  const positionOrder = player.positionOrder;
  const isStarter =
    mode === "pitch" && typeof positionOrder === "number" && positionOrder <= 11;
  const isBench =
    mode === "pitch" && typeof positionOrder === "number" && positionOrder > 11;

  const localizedClubName = formatClubDisplayName(effective.club, t);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-surface border-t sm:border border-line rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-sheet-up sm:animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="w-12 h-1.5 bg-line-strong rounded-full mx-auto mb-4 sm:hidden" />

        {/* 1. HEADER */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
          <div className="flex items-center gap-3.5 min-w-0">
            <ClubCrest
              name={effective.club.name}
              shortName={effective.club.shortName}
              logoUrl={effective.club.logoUrl}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-accent-text font-display font-black text-xs uppercase tracking-wider">
                  {t(`pos.${effective.position}`)}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface-2 border border-line text-ink font-display font-black text-xs tabular-nums">
                  £{displayPrice}m
                </span>
                <span className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-accent-text font-bold text-[11px] tabular-nums">
                  {t("player.ownedBy", { pct: selectedByPercent.toFixed(1) })}
                </span>
                {isCaptain && (
                  <span className="foil-gold px-1.5 py-0.5 rounded text-[10px] font-black leading-none">
                    C
                  </span>
                )}
                {isViceCaptain && (
                  <span className="bg-surface-3 text-ink px-1.5 py-0.5 rounded text-[10px] font-black leading-none border border-line-strong">
                    V
                  </span>
                )}
              </div>

              <h2
                id="player-modal-title"
                className="font-display font-black text-xl sm:text-2xl text-ink tracking-tight truncate mt-1.5"
              >
                {effective.firstName} {effective.lastName}
              </h2>

              <div className="flex items-center gap-2 text-xs font-semibold text-muted mt-0.5">
                <span className="truncate">{localizedClubName}</span>
                <span className="text-line-strong">•</span>
                <span className="font-bold uppercase tracking-wider text-[11px]">
                  {effective.club.shortName}
                </span>
                {mode === "pitch" && typeof positionOrder === "number" && (
                  <>
                    <span className="text-line-strong">•</span>
                    <span className="text-[11px] font-bold text-accent-text">
                      {isStarter
                        ? t("player.startingXI")
                        : t("player.benchSlot", { order: positionOrder - 11 })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* 2. UPCOMING SCHEDULE (NEXT 5 FIXTURES) WITH FDR */}
        <div className="pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-[11px] font-display font-bold uppercase tracking-wider text-muted">
              {t("player.upcomingFixtures")}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t("player.fdrTitle")} (1–5)
            </span>
          </div>

          {loadingDetails && upcomingFixtures.length === 0 ? (
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="h-16 rounded-xl skeleton border border-line"
                />
              ))}
            </div>
          ) : upcomingFixtures.length === 0 ? (
            <div className="p-3 rounded-xl bg-surface-2 border border-line text-center text-xs text-muted font-medium">
              {t("player.noFixture")}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {upcomingFixtures.slice(0, 5).map((fx) => {
                const localizedTag = formatFixtureOpponentTag(
                  fx.opponentShortName,
                  fx.isHome,
                  {
                    home: t("player.home"),
                    away: t("player.away"),
                  }
                );
                const fdrClasses = getFdrBadgeClasses(fx.fdr);
                const fdrLabel = t(`player.fdr.${fx.fdr}`);

                return (
                  <div
                    key={fx.fixtureId}
                    title={`${localizedTag} — ${t("player.fdrTitle")}: ${fx.fdr} (${fdrLabel})`}
                    className="rounded-xl bg-surface-2 border border-line p-2 flex flex-col items-center justify-between gap-1 text-center"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted tabular-nums">
                      {t("nav.gwShort", { id: fx.gameweekId })}
                    </span>
                    <span className="text-[11px] font-display font-black text-ink tracking-tight truncate max-w-full">
                      {localizedTag}
                    </span>
                    <span
                      className={`w-full py-0.5 rounded-md border text-[10px] font-display font-black tabular-nums leading-tight ${fdrClasses}`}
                    >
                      FDR {fx.fdr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. SEASON STATISTICS GRID */}
        <div className="py-4 border-b border-line">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-[11px] font-display font-bold uppercase tracking-wider text-muted">
              {t("player.seasonStats")}
            </span>
            <span className="text-[11px] font-semibold text-muted tabular-nums">
              {t("player.ownedByLabel")}:{" "}
              <strong className="text-ink font-black">
                {selectedByPercent.toFixed(1)}%
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="card p-2.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.totalPoints")}
              </div>
              <div className="text-lg font-display font-black text-accent-text tabular-nums mt-0.5">
                {stats.totalPoints}
              </div>
            </div>

            <div className="card p-2.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.form")}
              </div>
              <div className="text-lg font-display font-black text-ink tabular-nums mt-0.5">
                {Number(stats.form ?? 0).toFixed(1)}
              </div>
            </div>

            <div className="card p-2.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.goals")}
              </div>
              <div className="text-lg font-display font-black text-ink tabular-nums mt-0.5">
                {stats.goalsScored}
              </div>
            </div>

            <div className="card p-2.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.assists")}
              </div>
              <div className="text-lg font-display font-black text-ink tabular-nums mt-0.5">
                {stats.assists}
              </div>
            </div>

            <div className="card p-2.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.cleanSheets")}
              </div>
              <div className="text-lg font-display font-black text-ink tabular-nums mt-0.5">
                {stats.cleanSheets}
              </div>
            </div>

            <div className="card p-2.5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.minutes")}
              </div>
              <div className="text-lg font-display font-black text-ink tabular-nums mt-0.5">
                {stats.minutes}
              </div>
            </div>

            <div className="card p-2.5 text-center col-span-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                {t("player.stat.cards")}
              </div>
              <div className="flex items-center justify-center gap-3 mt-0.5">
                <span className="inline-flex items-center gap-1 text-base font-display font-black text-ink tabular-nums">
                  <span className="w-2.5 h-3.5 rounded-[2px] bg-amber-400 inline-block" />
                  {stats.yellowCards}
                </span>
                <span className="text-muted font-bold">/</span>
                <span className="inline-flex items-center gap-1 text-base font-display font-black text-ink tabular-nums">
                  <span className="w-2.5 h-3.5 rounded-[2px] bg-rose-500 inline-block" />
                  {stats.redCards}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. CONTEXTUAL ACTIONS */}
        <div className="pt-4">
          {isDeadlineLocked ? (
            <div className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-warning-text text-xs font-bold text-center">
              {t("player.readOnly")}
            </div>
          ) : mode === "market" ? (
            isOwned ? (
              <button
                type="button"
                disabled
                className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-surface-2 border border-line text-muted font-display font-bold text-sm tracking-wider uppercase cursor-not-allowed"
              >
                <span>{t("player.alreadyInSquad")}</span>
              </button>
            ) : (
              <div className="space-y-2">
                {addDisabledReason && (
                  <div className="text-[11px] font-semibold text-warning-text text-center">
                    {addDisabledReason}
                  </div>
                )}
                <button
                  type="button"
                  disabled={Boolean(addDisabledReason) || !onAddToSquad}
                  onClick={() => {
                    if (!onAddToSquad) return;
                    onAddToSquad(effective);
                    onClose();
                  }}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-accent hover:bg-accent-strong text-on-accent font-display font-black text-sm tracking-wider uppercase shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-base font-black leading-none">+</span>
                  <span>{t("player.addToSquad")}</span>
                </button>
              </div>
            )
          ) : (
            <div className="space-y-2.5">
              {/* Substitute / Swap Button */}
              {typeof positionOrder === "number" && onStartSwap && (
                <button
                  type="button"
                  onClick={() => {
                    onStartSwap(positionOrder);
                    onClose();
                  }}
                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-bold text-sm tracking-wide uppercase transition-all"
                >
                  <IconSwap className="w-4 h-4 text-accent" />
                  <span>{t("player.substitute")}</span>
                </button>
              )}

              {/* Armband row: only for starters */}
              {isStarter && onMakeCaptain && onMakeViceCaptain && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isCaptain}
                    onClick={() => {
                      onMakeCaptain(effective.id);
                      onClose();
                    }}
                    className={`h-11 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all ${
                      isCaptain
                        ? "foil-gold shadow-md font-black"
                        : "bg-surface-2 hover:bg-surface-3 border border-line text-ink"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-gold text-on-gold flex items-center justify-center font-black text-[11px]">
                      C
                    </span>
                    <span>
                      {isCaptain ? t("player.captain") : t("player.makeCaptain")}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isViceCaptain || isCaptain}
                    onClick={() => {
                      onMakeViceCaptain(effective.id);
                      onClose();
                    }}
                    className={`h-11 flex items-center justify-center gap-2 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all ${
                      isViceCaptain
                        ? "bg-surface-3 border-2 border-accent text-accent-text font-black"
                        : "bg-surface-2 hover:bg-surface-3 border border-line text-ink"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-surface-3 text-ink border border-line flex items-center justify-center font-black text-[11px]">
                      V
                    </span>
                    <span>
                      {isViceCaptain ? t("player.vice") : t("player.makeVice")}
                    </span>
                  </button>
                </div>
              )}

              {isBench && (
                <div className="text-[11px] font-medium text-muted text-center py-0.5">
                  {t("player.benchNoArmband")}
                </div>
              )}

              {/* Remove / Transfer Out Button */}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove(effective.id);
                    onClose();
                  }}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger-text font-display font-bold text-xs tracking-wider uppercase transition-colors"
                >
                  <IconX className="w-4 h-4" />
                  <span>{t("player.transferOut")}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
