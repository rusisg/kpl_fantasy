"use client";

import { SelectedSlotPlayer } from "../lib/types";
import { useTranslation } from "../lib/i18n";
import ClubCrest from "./ClubCrest";
import { IconSwap, IconX } from "./Icons";

interface PlayerActionSheetProps {
  player: SelectedSlotPlayer | null;
  isOpen: boolean;
  onClose: () => void;
  onMakeCaptain: (playerId: string) => void;
  onMakeViceCaptain: (playerId: string) => void;
  onStartSwap: (positionOrder: number) => void;
  onRemove: (playerId: string) => void;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isDeadlineLocked: boolean;
}

export default function PlayerActionSheet({
  player,
  isOpen,
  onClose,
  onMakeCaptain,
  onMakeViceCaptain,
  onStartSwap,
  onRemove,
  isCaptain,
  isViceCaptain,
  isDeadlineLocked,
}: PlayerActionSheetProps) {
  const { t } = useTranslation();

  if (!isOpen || !player) return null;

  const isStarter = player.positionOrder <= 11;
  const isBench = !isStarter;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-sheet-name"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border-t sm:border border-line rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-sheet-up sm:animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab bar on mobile */}
        <div className="w-12 h-1.5 bg-line-strong rounded-full mx-auto mb-4 sm:hidden" />

        {/* Player Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            <ClubCrest
              name={player.club.name}
              shortName={player.club.shortName}
              logoUrl={player.club.logoUrl}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-accent-text font-display font-black text-xs uppercase">
                  {player.position}
                </span>
                <span className="text-xs font-bold text-muted uppercase tracking-wider">
                  {player.club.shortName}
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
                id="player-sheet-name"
                className="font-display font-black text-xl sm:text-2xl text-ink tracking-tight truncate mt-1"
              >
                {player.firstName} {player.lastName}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 py-4">
          <div className="card p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t("player.price")}
            </div>
            <div className="text-base font-display font-black text-ink tabular-nums mt-0.5">
              £{Number(player.purchasePrice ?? player.price).toFixed(1)}m
            </div>
          </div>

          <div className="card p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t("player.points")}
            </div>
            <div className="text-base font-display font-black text-accent-text tabular-nums mt-0.5">
              {player.totalPoints ?? 0}
            </div>
          </div>

          <div className="card p-2.5 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {isStarter ? "Starting XI" : "Bench"}
            </div>
            <div className="text-base font-display font-black text-ink mt-0.5">
              #{player.positionOrder}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isDeadlineLocked ? (
          <div className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-warning-text text-xs font-bold text-center">
            {t("player.readOnly")}
          </div>
        ) : (
          <div className="space-y-2.5 pt-2">
            {/* Substitute / Swap Button */}
            <button
              type="button"
              onClick={() => {
                onStartSwap(player.positionOrder);
                onClose();
              }}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-bold text-sm tracking-wide uppercase transition-all"
            >
              <IconSwap className="w-4 h-4 text-accent" />
              <span>{t("player.substitute")}</span>
            </button>

            {/* Armband row: only for starters */}
            {isStarter && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isCaptain}
                  onClick={() => {
                    onMakeCaptain(player.id);
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
                  <span>{isCaptain ? t("player.captain") : t("player.makeCaptain")}</span>
                </button>

                <button
                  type="button"
                  disabled={isViceCaptain || isCaptain}
                  onClick={() => {
                    onMakeViceCaptain(player.id);
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
                  <span>{isViceCaptain ? t("player.vice") : t("player.makeVice")}</span>
                </button>
              </div>
            )}

            {isBench && (
              <div className="text-[11px] font-medium text-muted text-center py-1">
                {t("player.benchNoArmband")}
              </div>
            )}

            {/* Remove / Transfer Out Button */}
            <button
              type="button"
              onClick={() => {
                onRemove(player.id);
                onClose();
              }}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger-text font-display font-bold text-xs tracking-wider uppercase transition-colors"
            >
              <IconX className="w-4 h-4" />
              <span>{t("player.transferOut")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
