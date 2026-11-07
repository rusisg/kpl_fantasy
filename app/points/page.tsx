"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PageShell, { GameweekStepper } from "../../components/PageShell";
import {
  ChipType,
  GameweekPointsPlayer,
  PointsApiData,
  Position,
} from "../../lib/types";
import {
  formatClubDisplayName,
  TranslationKey,
  useTranslation,
} from "../../lib/i18n";
import ClubCrest from "../../components/ClubCrest";
import { IconChart, IconCheck, IconShare, IconX } from "../../components/Icons";

const CHIP_BADGE_KEYS: Record<ChipType, TranslationKey> = {
  WILDCARD: "points.chipBadge.WILDCARD",
  TRIPLE_CAPTAIN: "points.chipBadge.TRIPLE_CAPTAIN",
  BENCH_BOOST: "points.chipBadge.BENCH_BOOST",
  FREE_HIT: "points.chipBadge.FREE_HIT",
};

const CHIP_SHORT_LABELS: Record<ChipType, TranslationKey> = {
  WILDCARD: "chip.WILDCARD",
  TRIPLE_CAPTAIN: "chip.TRIPLE_CAPTAIN",
  BENCH_BOOST: "chip.BENCH_BOOST",
  FREE_HIT: "chip.FREE_HIT",
};

// Matches /squad pitch orientation: Attacking third at top, Goalkeeper in penalty box at bottom
const PITCH_ROWS: Position[] = [
  Position.FWD,
  Position.MID,
  Position.DEF,
  Position.GK,
];

function AutoSubArrow({ direction }: { direction: "in" | "out" }) {
  if (direction === "in") {
    return (
      <svg
        className="w-2.5 h-2.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </svg>
    );
  }
  return (
    <svg
      className="w-2.5 h-2.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

function PitchPlayerCard({
  player,
  compact,
  onClick,
}: {
  player: GameweekPointsPlayer;
  compact?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  // Only active starters on the pitch show the active Captain / Vice-Captain armband
  const hasActiveMultiplier = player.multiplier > 1;
  const armbandLabel =
    player.isCaptain && hasActiveMultiplier
      ? `C ${player.multiplier}×`
      : player.vicePromoted && hasActiveMultiplier
        ? `C ${player.multiplier}×`
        : player.isCaptain
          ? "C"
          : player.isViceCaptain
            ? "V"
            : null;

  const isGoldArmband =
    (player.isCaptain && hasActiveMultiplier) || Boolean(player.vicePromoted);

  const autoSubTooltip = player.subbedIn
    ? t("points.subbedInReason", {
        name: player.subbedPartnerName ?? "—",
      })
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={autoSubTooltip ?? `${player.firstName} ${player.lastName}`}
      className="group relative flex flex-col items-center cursor-pointer select-none transition-transform active:scale-95 focus:outline-none min-w-0"
    >
      <div
        className={`relative ${
          compact
            ? "w-[3.85rem] xs:w-[4.2rem] sm:w-[5.4rem]"
            : "w-[4.4rem] sm:w-[5.4rem]"
        } rounded-xl sm:rounded-2xl p-1 sm:p-1.5 text-center transition-all bg-surface/95 backdrop-blur-md border border-line hover:border-accent hover:-translate-y-0.5 shadow-xl`}
      >
        {/* Incoming Auto-Sub Badge (Top-Left, non-overlapping) */}
        {player.subbedIn && (
          <span
            title={autoSubTooltip}
            className="absolute -top-2 -left-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white border border-surface flex items-center justify-center shadow-md z-20"
          >
            <AutoSubArrow direction="in" />
          </span>
        )}

        {/* Active Captain / Vice-Captain Armband (Top-Right) */}
        {armbandLabel && (
          <span
            className={`absolute -top-2 -right-1.5 px-1.5 h-5 min-w-[1.25rem] rounded-full flex items-center justify-center font-display font-black text-[9px] leading-none shadow-md z-20 ${
              isGoldArmband
                ? "foil-gold"
                : "bg-surface-3 border border-line-strong text-ink"
            }`}
          >
            {armbandLabel}
          </span>
        )}

        {/* Club Crest & Short Name */}
        <div className="flex items-center justify-center gap-1 bg-surface-2 rounded-lg py-0.5 px-1 mb-1">
          <ClubCrest
            name={player.club.name}
            shortName={player.club.shortName}
            logoUrl={player.club.logoUrl}
            size="xs"
          />
          <span className="text-[9px] font-display font-black text-muted uppercase tracking-wider truncate">
            {player.club.shortName}
          </span>
        </div>

        {/* Player Last Name */}
        <div className="font-display font-black text-[10px] sm:text-xs text-ink truncate px-0.5 group-hover:text-accent transition-colors">
          {player.lastName}
        </div>

        {/* Earned Gameweek Points Tag */}
        <div
          className={`mt-0.5 py-0.5 px-1 rounded font-display font-black text-[10px] sm:text-[11px] tabular-nums truncate ${
            player.points > 0
              ? "bg-accent/15 text-accent-text"
              : player.points < 0
                ? "bg-danger/15 text-danger-text"
                : "bg-surface-2 text-muted"
          }`}
        >
          {player.points} {t("nav.pts")}
        </div>
      </div>
    </button>
  );
}

function BenchPlayerCard({
  player,
  subTag,
  benchCounts,
  onClick,
}: {
  player: GameweekPointsPlayer;
  subTag: string;
  benchCounts: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  const autoSubTooltip = player.subbedOut
    ? t("points.subbedOutReason", {
        name: player.subbedPartnerName ?? "—",
      })
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={autoSubTooltip ?? `${player.firstName} ${player.lastName}`}
      className={`w-full p-2 sm:p-2.5 rounded-2xl text-center cursor-pointer select-none relative transition-all active:scale-95 bg-surface-2 border border-line hover:border-line-strong focus:outline-none ${
        !benchCounts ? "opacity-90 hover:opacity-100" : ""
      }`}
    >
      {/* Top Badge Strip: Slot Tag + Clean Inline Outgoing Sub Indicator */}
      <div className="flex items-center justify-center gap-1 mb-1.5 flex-wrap">
        <span className="inline-block px-1.5 py-0.5 rounded bg-surface-3 text-[9px] font-display font-black text-muted uppercase leading-none">
          {subTag}
        </span>

        {player.subbedOut && (
          <span
            title={autoSubTooltip}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-300 text-[9px] font-display font-black leading-none"
          >
            <AutoSubArrow direction="out" />
            <span>0&apos;</span>
          </span>
        )}

        {player.isCaptain && player.subbedOut && (
          <span
            title={t("points.vicePromoted")}
            className="inline-block px-1.5 py-0.5 rounded bg-surface-3 border border-line text-[9px] font-display font-bold text-muted line-through leading-none"
          >
            C
          </span>
        )}
      </div>

      {/* Club Crest & Short Name */}
      <div className="flex items-center justify-center gap-1 mb-1">
        <ClubCrest
          name={player.club.name}
          shortName={player.club.shortName}
          logoUrl={player.club.logoUrl}
          size="xs"
        />
        <span className="text-[9px] font-display font-black text-muted uppercase tracking-wider truncate">
          {player.club.shortName}
        </span>
      </div>

      {/* Player Last Name */}
      <div className="font-display font-black text-xs text-ink truncate">
        {player.lastName}
      </div>

      {/* Position + Earned Points */}
      <div className="text-[10px] font-bold text-muted tabular-nums mt-1 flex items-center justify-center gap-1">
        <span>{t(`pos.${player.position}`)}</span>
        <span>•</span>
        <span
          className={`font-display font-black ${
            player.points > 0
              ? "text-accent-text"
              : player.points < 0
                ? "text-danger-text"
                : "text-muted"
          }`}
        >
          {player.points} {t("nav.pts")}
        </span>
      </div>
    </button>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card p-3 sm:p-4 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
        {label}
      </div>
      <div
        className={`text-2xl sm:text-3xl font-display font-black tabular-nums mt-0.5 ${
          accent ? "text-accent-text" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MatchBreakdownModal({
  player,
  gameweekId,
  onClose,
}: {
  player: GameweekPointsPlayer | null;
  gameweekId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!player) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, onClose]);

  if (!player) return null;

  const breakdown = player.breakdown ?? [];
  const fixture = player.fixture ?? null;
  const localizedClubName = formatClubDisplayName(player.club, t);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-breakdown-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-canvas/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface border-t sm:border border-line rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl animate-sheet-up sm:animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab bar */}
        <div className="w-12 h-1.5 bg-line-strong rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
          <div className="flex items-center gap-3.5 min-w-0">
            <ClubCrest
              name={player.club.name}
              shortName={player.club.shortName}
              logoUrl={player.club.logoUrl}
              size="lg"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-surface-3 text-accent-text font-display font-black text-xs uppercase">
                  {t(`pos.${player.position}`)}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-surface-2 border border-line text-muted font-display font-bold text-[11px] uppercase">
                  {t("nav.gwShort", { id: gameweekId })}
                </span>
                {player.isCaptain && player.multiplier > 1 && (
                  <span className="foil-gold px-2 py-0.5 rounded-md text-[10px] font-display font-black leading-none">
                    C ({player.multiplier}×)
                  </span>
                )}
                {player.isViceCaptain && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-display font-black leading-none ${
                      player.vicePromoted
                        ? "foil-gold"
                        : "bg-surface-3 text-ink border border-line-strong"
                    }`}
                  >
                    V{player.vicePromoted ? ` (${player.multiplier}×)` : ""}
                  </span>
                )}
              </div>

              <h2
                id="match-breakdown-modal-title"
                className="font-display font-black text-xl sm:text-2xl text-ink tracking-tight truncate mt-1.5"
              >
                {player.firstName} {player.lastName}
              </h2>

              <div className="text-xs font-semibold text-muted truncate mt-0.5">
                {localizedClubName} ({player.club.shortName})
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

        {/* Auto-Substitution Alert Banner (if subbed in or out) */}
        {(player.subbedIn || player.subbedOut || player.vicePromoted) && (
          <div className="pt-3 space-y-2">
            {player.subbedIn && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-300 text-xs font-bold">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <AutoSubArrow direction="in" />
                </span>
                <span>
                  {t("points.subbedInReason", {
                    name: player.subbedPartnerName ?? "—",
                  })}
                </span>
              </div>
            )}

            {player.subbedOut && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-600 dark:text-rose-300 text-xs font-bold">
                <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
                  <AutoSubArrow direction="out" />
                </span>
                <span>
                  {t("points.subbedOutReason", {
                    name: player.subbedPartnerName ?? "—",
                  })}
                </span>
              </div>
            )}

            {player.vicePromoted && (
              <div className="px-3 py-2 rounded-xl bg-gold/15 border border-gold/40 text-ink text-xs font-bold">
                ★ {t("points.vicePromoted")}
              </div>
            )}
          </div>
        )}

        {/* Fixture Result Card */}
        <div className="py-4 border-b border-line">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-muted mb-2">
            {t("points.modal.fixtureResult")}
          </div>

          {fixture ? (
            <div className="rounded-2xl bg-surface-2 border border-line p-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ClubCrest
                  name={fixture.homeClub.name}
                  shortName={fixture.homeClub.shortName}
                  logoUrl={fixture.homeClub.logoUrl}
                  size="sm"
                />
                <span className="font-display font-black text-xs sm:text-sm text-ink truncate">
                  {formatClubDisplayName(fixture.homeClub, t)}
                </span>
              </div>

              <div className="px-3 py-1 rounded-xl bg-surface-3 border border-line-strong font-display font-black text-sm sm:text-base text-ink tabular-nums shrink-0">
                {fixture.homeScore !== null && fixture.awayScore !== null
                  ? `${fixture.homeScore} – ${fixture.awayScore}`
                  : "vs"}
              </div>

              <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                <span className="font-display font-black text-xs sm:text-sm text-ink truncate">
                  {formatClubDisplayName(fixture.awayClub, t)}
                </span>
                <ClubCrest
                  name={fixture.awayClub.name}
                  shortName={fixture.awayClub.shortName}
                  logoUrl={fixture.awayClub.logoUrl}
                  size="sm"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-surface-2 border border-line p-3 text-center text-xs text-muted font-medium">
              {t("points.modal.noFixture")}
            </div>
          )}
        </div>

        {/* Itemized Point Sources Breakdown */}
        <div className="pt-4 space-y-3">
          <div className="text-[11px] font-display font-bold uppercase tracking-wider text-muted">
            {t("points.modal.pointSources")}
          </div>

          <div className="rounded-2xl border border-line overflow-hidden divide-y divide-line bg-surface-2/60">
            <div className="px-3.5 py-2 bg-surface-2 flex items-center justify-between text-[10px] font-display font-black uppercase tracking-wider text-muted">
              <span>{t("points.modal.stat")}</span>
              <span>{t("points.modal.pts")}</span>
            </div>

            {breakdown.map((item, idx) => {
              const labelKey =
                `points.break.${item.category}` as TranslationKey;
              const formattedPts =
                item.points > 0 ? `+${item.points}` : `${item.points}`;

              return (
                <div
                  key={`${item.category}-${idx}`}
                  className="px-3.5 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold"
                >
                  <span className="text-ink">
                    {t(labelKey, { n: item.statValue })}
                  </span>
                  <span
                    className={`font-display font-black tabular-nums ${
                      item.points > 0
                        ? "text-accent-text"
                        : item.points < 0
                          ? "text-danger-text"
                          : "text-muted"
                    }`}
                  >
                    {formattedPts}
                  </span>
                </div>
              );
            })}

            {player.multiplier > 1 && (
              <>
                <div className="px-3.5 py-2 bg-surface-2/80 flex items-center justify-between text-xs font-bold text-muted">
                  <span>{t("points.modal.basePoints")}</span>
                  <span className="font-display font-black text-ink tabular-nums">
                    {player.basePoints}
                  </span>
                </div>
                <div className="px-3.5 py-2 bg-surface-2/80 flex items-center justify-between text-xs font-bold text-muted">
                  <span>{t("points.modal.multiplier")}</span>
                  <span className="font-display font-black text-accent-text tabular-nums">
                    ×{player.multiplier}
                  </span>
                </div>
              </>
            )}

            <div className="px-3.5 py-3 bg-surface-3 flex items-center justify-between">
              <span className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-ink">
                {t("points.modal.finalPoints")}
              </span>
              <span className="font-display font-black text-base sm:text-lg text-accent-text tabular-nums">
                {player.points} {t("nav.pts")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PointsPage() {
  const { t } = useTranslation();
  const cacheRef = useRef<Map<number, PointsApiData>>(new Map());
  const [data, setData] = useState<PointsApiData | null>(null);
  const [requestedGw, setRequestedGw] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [selectedModalPlayer, setSelectedModalPlayer] =
    useState<GameweekPointsPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;

    const targetGw = requestedGw;
    if (targetGw && cacheRef.current.has(targetGw)) {
      setData(cacheRef.current.get(targetGw)!);
      setInitialLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = targetGw ? `?gameweekId=${targetGw}` : "";
        const res = await fetch(`/api/points${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error || "Failed to load points.");
          return;
        }
        if (json.data?.selectedGameweekId) {
          cacheRef.current.set(json.data.selectedGameweekId, json.data);
        }
        setData(json.data);
      } catch {
        if (!cancelled) setError("Network error while loading points.");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitialLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [requestedGw]);

  const history = data?.history ?? [];
  const availableGwIds =
    data?.availableGameweekIds && data.availableGameweekIds.length > 0
      ? data.availableGameweekIds
      : history.map((h) => h.gameweekId);
  const snapshot = data?.snapshot ?? null;
  const starters =
    snapshot?.players
      .filter((p) => p.positionOrder <= 11)
      .sort((a, b) => a.positionOrder - b.positionOrder) ?? [];
  const bench =
    snapshot?.players
      .filter((p) => p.positionOrder > 11)
      .sort((a, b) => a.positionOrder - b.positionOrder) ?? [];
  const benchCounts = snapshot?.chipPlayed === "BENCH_BOOST";

  const startersByPos = {
    [Position.GK]: starters.filter((p) => p.position === Position.GK),
    [Position.DEF]: starters.filter((p) => p.position === Position.DEF),
    [Position.MID]: starters.filter((p) => p.position === Position.MID),
    [Position.FWD]: starters.filter((p) => p.position === Position.FWD),
  };
  const currentFormation = `${startersByPos[Position.DEF].length}-${startersByPos[Position.MID].length}-${startersByPos[Position.FWD].length}`;

  const selectGameweek = useCallback((gwId: number) => {
    setSelectedModalPlayer(null);
    if (cacheRef.current.has(gwId)) {
      setData(cacheRef.current.get(gwId)!);
    }
    setRequestedGw(gwId);
  }, []);

  const stepTo = useCallback(
    (target: number) => {
      if (!snapshot || availableGwIds.length === 0) return;
      const forward = target > snapshot.gameweekId;
      const candidates = availableGwIds.filter((id) =>
        forward ? id > snapshot.gameweekId : id < snapshot.gameweekId
      );
      if (candidates.length === 0) return;
      const nextGw = forward ? Math.min(...candidates) : Math.max(...candidates);
      selectGameweek(nextGw);
    },
    [availableGwIds, selectGameweek, snapshot]
  );

  const handleShare = async () => {
    if (!snapshot) return;
    const shareText = t("points.shareText", {
      pts: snapshot.totalPoints,
      gw: snapshot.gameweekId,
    });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "KPL Fantasy",
          text: shareText,
          url: window.location.origin,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(
        `${shareText} ${window.location.origin}`
      );
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  return (
    <PageShell
      icon={<IconChart className="w-6 h-6" />}
      title={t("points.title")}
      subtitle={
        data?.squadName
          ? `${data.squadName} • ${t("points.seasonTotal")}: ${data.seasonTotalPoints ?? 0} ${t("nav.pts")}`
          : t("points.defaultSubtitle")
      }
      aside={
        snapshot && availableGwIds.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label={t("points.selectGw")}
              value={snapshot.gameweekId}
              onChange={(e) => selectGameweek(Number(e.target.value))}
              disabled={initialLoading}
              className="h-11 bg-surface-2 border border-line text-ink font-display font-black text-xs uppercase tracking-wider rounded-2xl px-3.5 focus:border-accent focus:outline-none transition-colors cursor-pointer"
            >
              {availableGwIds.map((gwId) => (
                <option key={gwId} value={gwId}>
                  {t("nav.gwShort", { id: gwId })}
                </option>
              ))}
            </select>

            <GameweekStepper
              gameweekId={snapshot.gameweekId}
              min={Math.min(...availableGwIds)}
              max={Math.max(...availableGwIds)}
              onChange={stepTo}
              disabled={initialLoading}
            />
          </div>
        ) : null
      }
    >
      <MatchBreakdownModal
        player={selectedModalPlayer}
        gameweekId={snapshot?.gameweekId ?? 1}
        onClose={() => setSelectedModalPlayer(null)}
      />

      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl text-sm font-bold bg-danger/15 text-danger-text border border-danger/30"
        >
          {error}
        </div>
      )}

      {initialLoading && !data ? (
        <div className="h-96 rounded-3xl bg-surface-2 border border-line animate-pulse" />
      ) : data && !data.hasSquad ? (
        <div className="card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-warning/30 bg-warning/5">
          <div>
            <h2 className="font-display font-black text-lg text-warning-text">
              {t("points.noSquadTitle")}
            </h2>
            <p className="text-xs font-medium text-muted mt-1 max-w-md">
              {t("points.noSquadDesc")}
            </p>
          </div>
          <Link
            href="/squad"
            className="h-11 px-6 rounded-xl bg-accent text-on-accent font-display font-black text-xs uppercase tracking-wider flex items-center justify-center transition-all shadow-md shadow-accent/20 self-start sm:self-auto whitespace-nowrap"
          >
            {t("points.goToSquad")} →
          </Link>
        </div>
      ) : data && !snapshot ? (
        <div className="card p-8 sm:p-12 text-center text-muted font-medium space-y-2">
          <div className="text-3xl">⚽</div>
          <p className="text-sm">{t("points.noScoredGw")}</p>
        </div>
      ) : snapshot ? (
        <div
          className={`space-y-6 transition-opacity ${
            loading ? "opacity-60" : ""
          }`}
        >
          {/* 4-Card Top Scoreboard Metric Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label={t("points.gwPoints")}
              value={snapshot.totalPoints}
              accent
            />
            <StatTile
              label={t("points.gwAverage")}
              value={snapshot.gameweekAverage}
            />
            <StatTile
              label={t("points.gwHighest")}
              value={snapshot.gameweekHighest}
            />
            <StatTile
              label={t("points.gwRank")}
              value={snapshot.rank ? `#${snapshot.rank}` : "—"}
            />
          </div>

          {/* Active Chip Badge + Status Bar + Share Action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {snapshot.chipPlayed && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-accent/15 border border-accent/40 text-accent-text text-xs font-display font-black uppercase tracking-wider shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span>{t(CHIP_BADGE_KEYS[snapshot.chipPlayed])}</span>
                </div>
              )}

              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-2 border border-line text-[11px] font-display font-bold uppercase tracking-wider text-muted">
                <span
                  className={`w-2 h-2 rounded-full ${
                    snapshot.isLive ? "bg-warning animate-pulse" : "bg-accent"
                  }`}
                />
                {snapshot.isLive
                  ? t("points.liveBadge")
                  : t("points.finalBadge")}
              </span>

              <span className="text-xs font-semibold text-muted hidden sm:inline">
                • {t("points.tapPlayerHint")}
              </span>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="h-10 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
            >
              {copiedShare ? (
                <IconCheck className="w-4 h-4 text-success-text" />
              ) : (
                <IconShare className="w-4 h-4" />
              )}
              <span>
                {copiedShare ? t("common.copied") : t("points.share")}
              </span>
            </button>
          </div>

          {/* Tactical Pitch View (replicating /squad pitch geometry & chalk markings) */}
          <section className="pitch rounded-3xl min-h-[620px] sm:h-[640px] border border-line shadow-2xl relative flex flex-col">
            {/* Pitch Chalk Lines */}
            <div className="absolute inset-x-8 sm:inset-x-14 top-0 h-24 sm:h-32 border-b-2 border-x-2 border-white/30 rounded-b-3xl pointer-events-none" />
            <div className="absolute inset-x-24 sm:inset-x-36 top-0 h-10 sm:h-12 border-b-2 border-x-2 border-white/30 rounded-b-xl pointer-events-none" />
            <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/30 pointer-events-none" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 sm:w-36 sm:h-36 border-2 border-white/30 rounded-full pointer-events-none" />
            <div className="absolute inset-x-8 sm:inset-x-14 bottom-0 h-24 sm:h-32 border-t-2 border-x-2 border-white/30 rounded-t-3xl pointer-events-none" />
            <div className="absolute inset-x-24 sm:inset-x-36 bottom-0 h-10 sm:h-12 border-t-2 border-x-2 border-white/30 rounded-t-xl pointer-events-none" />

            {/* Top Corner Badges (positioned cleanly in corners without pushing lineup) */}
            <div className="absolute top-3 left-3 sm:top-4 sm:left-5 z-20 pointer-events-none">
              <span className="inline-block px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur-md text-white/95 font-display font-black text-[10px] sm:text-[11px] uppercase tracking-wider border border-white/15 shadow-sm">
                {t("squad.formation", { f: currentFormation })}
              </span>
            </div>
            <div className="absolute top-3 right-3 sm:top-4 sm:right-5 z-20 pointer-events-none">
              <span className="inline-block px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur-md text-white/95 font-display font-black text-[10px] sm:text-[11px] uppercase tracking-wider border border-white/15 tabular-nums shadow-sm">
                {t("nav.gwShort", { id: snapshot.gameweekId })} •{" "}
                {snapshot.totalPoints} {t("nav.pts")}
              </span>
            </div>

            {/* Full-Height Lineup Container: FWD (top), MID, DEF, GK (bottom penalty box) */}
            <div className="relative z-10 flex-1 h-full w-full flex flex-col justify-between pt-12 pb-6 px-2 sm:px-6">
              {PITCH_ROWS.map((pos, rowIndex) => {
                const row = startersByPos[pos];
                const isFivePlayerLine = row.length >= 5;

                return (
                  <div
                    key={pos}
                    style={{ zIndex: 10 + rowIndex }}
                    className="flex items-center justify-around w-full gap-1 sm:gap-3 flex-nowrap py-1"
                  >
                    {row.map((p) => (
                      <PitchPlayerCard
                        key={p.playerId}
                        player={p}
                        compact={isFivePlayerLine}
                        onClick={() => setSelectedModalPlayer(p)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Dugout Bench Display (matching /squad 4-column bench grid) */}
          <section className="dugout card p-4 sm:p-5 rounded-3xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
                <h2 className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-ink">
                  {benchCounts
                    ? t("points.benchActive")
                    : t("points.benchInactive")}
                </h2>
              </div>
              <span className="text-[11px] font-bold text-muted">
                {t("points.tapPlayerHint")}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {bench.map((p, idx) => {
                const subTag =
                  p.position === Position.GK ? "GKP" : `${idx + 1}`;
                return (
                  <BenchPlayerCard
                    key={p.playerId}
                    player={p}
                    subTag={subTag}
                    benchCounts={benchCounts}
                    onClick={() => setSelectedModalPlayer(p)}
                  />
                );
              })}
            </div>
          </section>

          {/* Season History Table */}
          {history.length > 0 && (
            <section className="card rounded-3xl overflow-hidden shadow-xl">
              <h2 className="px-5 py-3.5 text-xs font-display font-black uppercase tracking-widest text-accent-text bg-surface-2 border-b border-line">
                {t("points.seasonHistory")}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-[10px] font-display font-black uppercase tracking-wider text-muted">
                      <th className="text-left px-5 py-2.5">
                        {t("points.colGw")}
                      </th>
                      <th className="text-right px-5 py-2.5">
                        {t("points.colPoints")}
                      </th>
                      <th className="text-right px-5 py-2.5">
                        {t("points.colRank")}
                      </th>
                      <th className="text-right px-5 py-2.5">
                        {t("points.colChip")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.map((h) => (
                      <tr
                        key={h.gameweekId}
                        onClick={() => selectGameweek(h.gameweekId)}
                        className={`cursor-pointer hover:bg-surface-2 transition-colors ${
                          h.gameweekId === snapshot.gameweekId
                            ? "bg-accent/10"
                            : ""
                        }`}
                      >
                        <td className="px-5 py-3 font-display font-bold text-ink">
                          {t("nav.gwShort", { id: h.gameweekId })}
                        </td>
                        <td className="px-5 py-3 text-right font-display font-black text-accent-text tabular-nums">
                          {h.totalPoints}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted">
                          {h.rank ? `#${h.rank}` : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-muted">
                          {h.chipPlayed
                            ? t(CHIP_SHORT_LABELS[h.chipPlayed])
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </PageShell>
  );
}
