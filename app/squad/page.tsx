"use client";

import { useEffect, useMemo, useState } from "react";
import { ChipType, ClubInfo, Position, SelectedSlotPlayer } from "../../lib/types";
import { useSquadStore, PlayerMarketItem } from "../../store/useSquadStore";
import OnboardingModal from "../../components/OnboardingModal";
import Navbar from "../../components/Navbar";
import MobileTabBar from "../../components/MobileTabBar";
import ClubCrest from "../../components/ClubCrest";
import PlayerModal, { PlayerModalMode } from "../../components/PlayerModal";
import { KffAttributionFooter } from "../../components/PageShell";
import { formatClubDisplayName, TranslationKey, useTranslation } from "../../lib/i18n";
import { formatFixtureOpponentTag, getFdrBadgeClasses } from "../../lib/fdr";
import { IconSearch, IconX, IconSwap, IconCheck } from "../../components/Icons";

interface ApiErrorItem {
  field?: string;
  message: string;
}

const ALL_CHIPS: ChipType[] = [
  ChipType.WILDCARD,
  ChipType.FREE_HIT,
  ChipType.BENCH_BOOST,
  ChipType.TRIPLE_CAPTAIN,
];

type SortOption = "priceDesc" | "priceAsc" | "points" | "name";

export default function SquadBuilderPage() {
  const {
    squadId,
    squadName,
    setSquadName,
    selectedPlayers,
    addPlayer,
    removePlayer,
    swapPlayers,
    canSwapPlayers,
    setCaptain,
    setViceCaptain,
    remainingBudget,
    freeTransfers,
    activeChip,
    usedChips,
    isUnlimitedTransfers,
    pendingTransfersCount,
    pendingTransferCost,
    captainId,
    viceCaptainId,
    activePositionFilter,
    activeClubFilter,
    searchQuery,
    setFilters,
    userProfile,
    setUserProfile,
    activeGameweek,
    setActiveGameweek,
    loadSquadFromApi,
  } = useSquadStore();

  const { t } = useTranslation();

  const [marketPlayers, setMarketPlayers] = useState<PlayerMarketItem[]>([]);
  const [clubs, setClubs] = useState<ClubInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialHydrating, setInitialHydrating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chipBusy, setChipBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [swapSourceOrder, setSwapSourceOrder] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<"pitch" | "market">("pitch");
  const [sortBy, setSortBy] = useState<SortOption>("priceDesc");

  // Player Details Modal state (supports both pitch and market players)
  const [modalState, setModalState] = useState<{
    player: PlayerMarketItem & Partial<SelectedSlotPlayer>;
    mode: PlayerModalMode;
  } | null>(null);

  // Initial load
  useEffect(() => {
    async function hydrateInitialState() {
      setInitialHydrating(true);
      try {
        const [squadRes, clubsRes] = await Promise.all([
          fetch("/api/squad"),
          fetch("/api/clubs"),
        ]);

        const [squadJson, clubsJson] = await Promise.all([
          squadRes.json(),
          clubsRes.json(),
        ]);

        if (clubsJson.success && Array.isArray(clubsJson.data)) {
          setClubs(clubsJson.data);
        }

        if (squadJson.success) {
          if (squadJson.user) setUserProfile(squadJson.user);
          if (squadJson.gameweek) setActiveGameweek(squadJson.gameweek);
          if (squadJson.data) {
            loadSquadFromApi(squadJson.data);
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
          }
        }
      } catch (err) {
        console.error("Failed to hydrate squad state:", err);
      } finally {
        setInitialHydrating(false);
      }
    }
    hydrateInitialState();
  }, [loadSquadFromApi, setActiveGameweek, setUserProfile]);

  // Market fetching
  useEffect(() => {
    async function fetchMarket() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activePositionFilter !== "ALL") {
          params.append("position", activePositionFilter);
        }
        if (activeClubFilter !== "ALL") {
          params.append("clubId", activeClubFilter);
        }
        if (searchQuery) {
          params.append("search", searchQuery);
        }

        const res = await fetch(`/api/players?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          setMarketPlayers(data.data);
        }
      } catch (err) {
        console.error("Failed to fetch market players:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMarket();
  }, [activePositionFilter, activeClubFilter, searchQuery]);

  const isDeadlineLocked = Boolean(activeGameweek?.isLocked);

  // Sorted market players
  const sortedMarketPlayers = useMemo(() => {
    const list = [...marketPlayers];
    switch (sortBy) {
      case "priceDesc":
        return list.sort((a, b) => Number(b.price) - Number(a.price));
      case "priceAsc":
        return list.sort((a, b) => Number(a.price) - Number(b.price));
      case "points":
        return list.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
      case "name":
        return list.sort((a, b) => a.lastName.localeCompare(b.lastName));
      default:
        return list;
    }
  }, [marketPlayers, sortBy]);

  const handleSaveSquad = async () => {
    if (isDeadlineLocked) {
      setSaveMessage(t("squad.err.locked"));
      return;
    }
    if (!squadName.trim()) {
      setSaveMessage(t("squad.err.name"));
      return;
    }
    if (selectedPlayers.length !== 15) {
      setSaveMessage(t("squad.err.count", { n: selectedPlayers.length }));
      return;
    }
    if (!captainId || !viceCaptainId) {
      setSaveMessage(t("squad.err.captain"));
      return;
    }
    setSaving(true);
    setSaveMessage(null);

    try {
      const payload = {
        name: squadName.trim(),
        players: selectedPlayers.map((p) => ({
          id: p.id,
          positionOrder: p.positionOrder,
        })),
        captainId,
        viceCaptainId,
      };

      const res = await fetch("/api/squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.data) {
        loadSquadFromApi(data.data);
        setSwapSourceOrder(null);
        setSaveMessage(`🎉 ${t("squad.saved")}`);
      } else {
        const errText = Array.isArray(data.errors)
          ? (data.errors as ApiErrorItem[]).map((e) => e.message).join(" ")
          : data.error || t("common.genericError");
        setSaveMessage(`❌ ${errText}`);
      }
    } catch {
      setSaveMessage(`❌ ${t("common.networkError")}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleChip = async (chip: ChipType) => {
    if (isDeadlineLocked || chipBusy) return;
    if (!squadId) {
      setSaveMessage(t("squad.err.chipNeedsSquad"));
      return;
    }
    const nextChip = activeChip === chip ? null : chip;
    setChipBusy(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/squad/chip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chip: nextChip }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        loadSquadFromApi(data.data);
        setSaveMessage(
          nextChip
            ? `🎉 ${t("chip.activated", { chip: t(`chip.${nextChip}` as TranslationKey) })}`
            : `🎉 ${t("chip.cancelled")}`
        );
      } else {
        setSaveMessage(`❌ ${data.error || t("common.genericError")}`);
      }
    } catch {
      setSaveMessage(`❌ ${t("common.networkError")}`);
    } finally {
      setChipBusy(false);
    }
  };

  const handlePlayerCardClick = (player: SelectedSlotPlayer) => {
    if (swapSourceOrder !== null) {
      // In swap mode: executing the swap or cancelling
      if (swapSourceOrder === player.positionOrder) {
        setSwapSourceOrder(null);
      } else {
        const swapped = swapPlayers(swapSourceOrder, player.positionOrder);
        if (swapped) {
          setSwapSourceOrder(null);
          setSaveMessage(`✓ ${t("squad.swapped")}`);
        } else {
          setSaveMessage(`❌ ${t("squad.swapInvalid")}`);
        }
      }
    } else {
      // Normal click: open Player Details Modal in pitch mode
      const marketMatch = marketPlayers.find((m) => m.id === player.id);
      setModalState({
        player: marketMatch ? { ...marketMatch, ...player } : player,
        mode: "pitch",
      });
    }
  };

  const startingXI = selectedPlayers
    .filter((p) => p.positionOrder <= 11)
    .sort((a, b) => a.positionOrder - b.positionOrder);
  const bench = selectedPlayers
    .filter((p) => p.positionOrder > 11)
    .sort((a, b) => a.positionOrder - b.positionOrder);

  const startersByPos = {
    [Position.GK]: startingXI.filter((p) => p.position === Position.GK),
    [Position.DEF]: startingXI.filter((p) => p.position === Position.DEF),
    [Position.MID]: startingXI.filter((p) => p.position === Position.MID),
    [Position.FWD]: startingXI.filter((p) => p.position === Position.FWD),
  };

  const currentFormation = `${startersByPos[Position.DEF].length}-${startersByPos[Position.MID].length}-${startersByPos[Position.FWD].length}`;

  const pendingTransfers = pendingTransfersCount();
  const transferHit = pendingTransferCost();
  const effectiveFreeTransfers = isUnlimitedTransfers
    ? t("squad.unlimited")
    : Math.max(0, freeTransfers - pendingTransfers);

  const swapSourcePlayer =
    swapSourceOrder !== null
      ? selectedPlayers.find((p) => p.positionOrder === swapSourceOrder) ?? null
      : null;

  return (
    <div className="min-h-screen text-ink flex flex-col transition-colors pb-24 lg:pb-8">
      <Navbar />

      <OnboardingModal
        isOpen={!initialHydrating && needsOnboarding}
        clubs={clubs}
        onClose={() => setNeedsOnboarding(false)}
        onComplete={({ squad, user }) => {
          if (user) setUserProfile(user);
          if (squad) loadSquadFromApi(squad);
          setSaveMessage(`🎉 ${t("squad.autoDrafted")}`);
        }}
      />

      <PlayerModal
        player={modalState?.player ?? null}
        mode={modalState?.mode ?? "pitch"}
        isOpen={modalState !== null}
        onClose={() => setModalState(null)}
        onMakeCaptain={(id) => {
          setCaptain(id);
          const p = selectedPlayers.find((x) => x.id === id);
          if (p) setSaveMessage(t("squad.captainSet", { name: p.lastName }));
        }}
        onMakeViceCaptain={(id) => {
          setViceCaptain(id);
          const p = selectedPlayers.find((x) => x.id === id);
          if (p) setSaveMessage(t("squad.viceSet", { name: p.lastName }));
        }}
        onStartSwap={(order) => {
          setSwapSourceOrder(order);
        }}
        onRemove={(id) => {
          const p = selectedPlayers.find((x) => x.id === id);
          removePlayer(id);
          if (p) setSaveMessage(t("squad.removed", { name: p.lastName }));
        }}
        onAddToSquad={(playerToAdd) => {
          const added = addPlayer(playerToAdd);
          if (added) {
            setSaveMessage(t("squad.added", { name: playerToAdd.lastName }));
          }
        }}
        isOwned={
          modalState?.player
            ? selectedPlayers.some((p) => p.id === modalState.player.id)
            : false
        }
        isCaptain={
          modalState?.player ? modalState.player.id === captainId : false
        }
        isViceCaptain={
          modalState?.player ? modalState.player.id === viceCaptainId : false
        }
        isDeadlineLocked={isDeadlineLocked}
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-3 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
        {/* Dynamic Broadcast Header */}
        <header className="card p-4 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
            {userProfile?.favoriteClub ? (
              <ClubCrest
                name={userProfile.favoriteClub.name}
                shortName={userProfile.favoriteClub.shortName}
                logoUrl={userProfile.favoriteClub.logoUrl}
                size="xl"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-line-strong flex items-center justify-center font-display font-black text-accent text-lg shadow-lg shadow-accent/10 shrink-0">
                KPL
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={squadName}
                  disabled={isDeadlineLocked}
                  onChange={(e) => setSquadName(e.target.value)}
                  placeholder={t("squad.placeholderName")}
                  aria-label={t("squad.editName")}
                  className="w-full sm:w-auto min-w-0 font-display font-black text-xl sm:text-2xl md:text-3xl tracking-tight text-ink bg-transparent border-b border-transparent hover:border-line-strong focus:border-accent focus:outline-none px-1 -ml-1 transition-colors"
                />
                {userProfile?.favoriteClub && (
                  <span className="hidden sm:inline-flex text-xs font-bold bg-surface-2 border border-line px-2.5 py-0.5 rounded-full text-ink-2 whitespace-nowrap">
                    ♥ {userProfile.favoriteClub.name}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                <span className="text-accent-text font-black">
                  {activeGameweek ? t("squad.gameweek", { id: activeGameweek.id }) : t("squad.preSeason")}
                </span>
                <span>•</span>
                <span className={isDeadlineLocked ? "text-warning-text" : "text-muted"}>
                  {activeGameweek
                    ? isDeadlineLocked
                      ? t("squad.lockedBanner", {
                          date: new Date(activeGameweek.deadline).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          }),
                        })
                      : t("squad.deadline", {
                          date: new Date(activeGameweek.deadline).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "numeric",
                            month: "short",
                          }),
                        })
                    : t("nav.schedulePending")}
                </span>
                <span>•</span>
                <span className="text-ink font-black">
                  {t("squad.formation", { f: currentFormation })}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Bar + Desktop Save CTA */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 bg-surface-2 p-2 rounded-2xl border border-line">
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 flex-1">
              <div className="px-2.5 py-1.5 text-center bg-surface sm:bg-transparent rounded-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                  {t("squad.players")}
                </div>
                <div className="text-lg sm:text-xl font-display font-black text-ink tabular-nums">
                  <span className={selectedPlayers.length === 15 ? "text-success-text" : "text-ink"}>
                    {selectedPlayers.length}
                  </span>
                  <span className="text-muted text-sm">/15</span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 text-center bg-surface sm:bg-transparent rounded-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                  {t("squad.bank")}
                </div>
                <div className="text-lg sm:text-xl font-display font-black text-accent-text tabular-nums">
                  £{remainingBudget().toFixed(1)}
                  <span className="text-xs font-bold">m</span>
                </div>
              </div>

              <div className="px-2.5 py-1.5 text-center bg-surface sm:bg-transparent rounded-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                  {t("squad.freeTransfers")}
                </div>
                <div className="text-lg sm:text-xl font-display font-black text-ink tabular-nums">
                  {effectiveFreeTransfers}
                </div>
              </div>

              <div className="px-2.5 py-1.5 text-center bg-surface sm:bg-transparent rounded-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted whitespace-nowrap">
                  {t("squad.cost")}
                </div>
                <div
                  className={`text-lg sm:text-xl font-display font-black tabular-nums ${
                    transferHit > 0 ? "text-danger-text" : "text-muted"
                  }`}
                >
                  {transferHit > 0 ? `-${transferHit}` : "0"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNeedsOnboarding(true)}
                disabled={isDeadlineLocked}
                className="flex-1 sm:flex-initial h-11 px-3.5 rounded-xl bg-surface hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink transition-colors disabled:opacity-40 select-none whitespace-nowrap"
              >
                {t("squad.autoDraft")}
              </button>
              <button
                type="button"
                onClick={handleSaveSquad}
                disabled={saving || isDeadlineLocked}
                className="flex-1 sm:flex-initial h-11 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-lg shadow-accent/25 disabled:opacity-40 select-none whitespace-nowrap"
              >
                {isDeadlineLocked
                  ? t("squad.gwLocked")
                  : saving
                  ? t("squad.saving")
                  : t("squad.saveSquad")}
              </button>
            </div>
          </div>
        </header>

        {/* Tactical Chips Row */}
        <section aria-label={t("chips.title")} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {ALL_CHIPS.map((chip) => {
            const isActive = activeChip === chip;
            const isUsed = usedChips.includes(chip);
            const anotherActive = activeChip !== null && !isActive;

            return (
              <div
                key={chip}
                className={`card p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-all ${
                  isActive
                    ? "border-accent bg-accent/10 shadow-lg shadow-accent/15"
                    : isUsed
                    ? "opacity-50 bg-surface-2"
                    : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="font-display font-black text-xs uppercase tracking-wider text-ink truncate">
                    {t(`chip.${chip}` as TranslationKey)}
                  </div>
                  <div className="text-[11px] text-muted truncate mt-0.5">
                    {t(`chip.${chip}.desc` as TranslationKey)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isDeadlineLocked || isUsed || anotherActive || chipBusy}
                  onClick={() => handleToggleChip(chip)}
                  className={`h-9 px-3 rounded-xl font-display font-black text-[11px] uppercase tracking-wider whitespace-nowrap shrink-0 transition-all select-none ${
                    isActive
                      ? "bg-accent text-on-accent shadow-sm"
                      : isUsed
                      ? "bg-surface-3 text-muted cursor-not-allowed"
                      : "bg-surface-2 hover:bg-surface-3 text-accent-text border border-line disabled:opacity-40"
                  }`}
                >
                  {isActive
                    ? t("chip.cancel")
                    : isUsed
                    ? t("chip.used")
                    : t("chip.play")}
                </button>
              </div>
            );
          })}
        </section>

        {/* Feedback Banner */}
        {saveMessage && (
          <div
            role="status"
            aria-live="polite"
            className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-lg ${
              saveMessage.startsWith("❌")
                ? "bg-danger/15 border border-danger/30 text-danger-text"
                : "bg-success/15 border border-success/30 text-success-text"
            }`}
          >
            <span>{saveMessage}</span>
            <button
              type="button"
              onClick={() => setSaveMessage(null)}
              className="p-1 hover:opacity-75 transition-opacity"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Swap Mode Banner */}
        {swapSourcePlayer && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-warning/15 border border-warning/40 text-warning-text flex items-center justify-between gap-3 text-xs sm:text-sm font-bold shadow-lg animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <IconSwap className="w-5 h-5 shrink-0" />
              <span className="truncate">
                {t("squad.swapBanner", { name: swapSourcePlayer.lastName })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSwapSourceOrder(null)}
              className="h-8 px-3 rounded-lg bg-surface border border-line text-ink text-xs font-display font-bold uppercase tracking-wider hover:bg-surface-3 shrink-0"
            >
              {t("squad.cancelSwap")}
            </button>
          </div>
        )}

        {/* Mobile View Switcher (Pitch vs Market) */}
        <div className="lg:hidden grid grid-cols-2 p-1 rounded-2xl bg-surface-2 border border-line">
          <button
            type="button"
            onClick={() => setMobileTab("pitch")}
            className={`h-10 rounded-xl font-display font-black text-xs uppercase tracking-wider transition-all select-none ${
              mobileTab === "pitch"
                ? "bg-accent text-on-accent shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {t("squad.tabPitch")} ({selectedPlayers.length}/15)
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("market")}
            className={`h-10 rounded-xl font-display font-black text-xs uppercase tracking-wider transition-all select-none ${
              mobileTab === "market"
                ? "bg-accent text-on-accent shadow-sm"
                : "text-muted hover:text-ink"
            }`}
          >
            {t("squad.tabMarket")}
          </button>
        </div>

        {/* Main 12-Column Grid: Pitch (7 cols) + Market (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* Pitch & Dugout Bench (7 columns) */}
          <div className={`lg:col-span-7 space-y-5 sm:space-y-6 ${mobileTab !== "pitch" ? "hidden lg:block" : ""}`}>
            {/* The Stadium Pitch */}
            <div className="pitch rounded-3xl p-3 sm:p-6 min-h-[500px] sm:min-h-[580px] flex flex-col justify-between border border-line shadow-2xl relative">
              {/* Pitch Chalk Lines */}
              <div className="absolute inset-x-8 sm:inset-x-14 top-0 h-24 sm:h-32 border-b-2 border-x-2 border-white/30 rounded-b-3xl pointer-events-none" />
              <div className="absolute inset-x-24 sm:inset-x-36 top-0 h-10 sm:h-12 border-b-2 border-x-2 border-white/30 rounded-b-xl pointer-events-none" />
              <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/30 pointer-events-none" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 sm:w-36 sm:h-36 border-2 border-white/30 rounded-full pointer-events-none" />
              <div className="absolute inset-x-8 sm:inset-x-14 bottom-0 h-24 sm:h-32 border-t-2 border-x-2 border-white/30 rounded-t-3xl pointer-events-none" />

              {/* Rows: FWD, MID, DEF, GK */}
              {([Position.FWD, Position.MID, Position.DEF, Position.GK] as Position[]).map((pos) => {
                const playersInRow = startersByPos[pos];

                return (
                  <div
                    key={pos}
                    className="relative z-10 flex items-center justify-around gap-1.5 py-1 sm:py-2"
                  >
                    {playersInRow.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFilters({ position: pos });
                          setMobileTab("market");
                        }}
                        className="px-4 py-2 rounded-full bg-canvas/60 backdrop-blur-md border border-white/20 text-white font-display font-black text-xs uppercase tracking-widest hover:border-accent hover:text-accent transition-all"
                      >
                        + {t("squad.emptySlot", { pos })}
                      </button>
                    ) : (
                      playersInRow.map((player) => {
                        const isSwapSource = swapSourceOrder === player.positionOrder;
                        const isValidSwapTarget =
                          swapSourceOrder !== null &&
                          swapSourceOrder !== player.positionOrder &&
                          canSwapPlayers(swapSourceOrder, player.positionOrder);

                        return (
                          <div
                            key={player.id}
                            onClick={() => handlePlayerCardClick(player)}
                            className="group relative flex flex-col items-center cursor-pointer select-none transition-transform active:scale-95"
                          >
                            {/* Collectible Broadcast Card */}
                            <div
                              className={`relative w-[4.4rem] sm:w-[5.4rem] rounded-xl sm:rounded-2xl p-1 sm:p-1.5 text-center transition-all bg-surface/95 backdrop-blur-md border shadow-xl ${
                                isSwapSource
                                  ? "ring-4 ring-warning border-warning scale-105"
                                  : isValidSwapTarget
                                  ? "ring-4 ring-accent border-accent animate-pulse scale-105"
                                  : "border-line hover:border-line-strong hover:-translate-y-0.5"
                              }`}
                            >
                              {/* Captaincy Armband */}
                              {player.id === captainId && (
                                <span className="foil-gold absolute -top-2 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center font-display font-black text-[11px] leading-none z-10">
                                  C
                                </span>
                              )}
                              {player.id === viceCaptainId && (
                                <span className="absolute -top-2 -right-1.5 w-5 h-5 rounded-full bg-surface-3 border border-line-strong text-ink flex items-center justify-center font-display font-black text-[10px] leading-none z-10">
                                  V
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
                              <div className="font-display font-black text-[11px] sm:text-xs text-ink truncate px-0.5">
                                {player.lastName}
                              </div>

                              {/* Price Tag */}
                              <div className="mt-0.5 py-0.5 px-1 rounded bg-accent/10 text-accent-text font-display font-black text-[10px] sm:text-[11px] tabular-nums">
                                £{Number(player.purchasePrice ?? player.price).toFixed(1)}m
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dugout Bench */}
            <div className="dugout card p-4 sm:p-5 rounded-3xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
                  <h3 className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-ink">
                    {t("squad.substitutes")}
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-muted">
                  {t("squad.benchHint")}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {bench.map((player, idx) => {
                  const isSwapSource = swapSourceOrder === player.positionOrder;
                  const isValidSwapTarget =
                    swapSourceOrder !== null &&
                    swapSourceOrder !== player.positionOrder &&
                    canSwapPlayers(swapSourceOrder, player.positionOrder);

                  const subTag = player.position === Position.GK ? "GKP" : `${idx + 1}`;

                  return (
                    <div
                      key={player.id}
                      onClick={() => handlePlayerCardClick(player)}
                      className={`p-2 sm:p-2.5 rounded-2xl text-center cursor-pointer select-none relative transition-all active:scale-95 bg-surface-2 border ${
                        isSwapSource
                          ? "ring-2 ring-warning border-warning"
                          : isValidSwapTarget
                          ? "ring-2 ring-accent border-accent animate-pulse"
                          : "border-line hover:border-line-strong"
                      }`}
                    >
                      <span className="inline-block px-1.5 py-0.2 rounded bg-surface-3 text-[9px] font-display font-black text-muted uppercase mb-1">
                        {subTag}
                      </span>
                      <div className="font-display font-black text-xs text-ink truncate">
                        {player.lastName}
                      </div>
                      <div className="text-[10px] font-bold text-muted tabular-nums mt-0.5">
                        {player.position}{" "}
                        <span className="text-accent-text font-black">
                          £{Number(player.purchasePrice ?? player.price).toFixed(1)}m
                        </span>
                      </div>
                    </div>
                  );
                })}

                {Array.from({ length: 4 - bench.length }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMobileTab("market")}
                    className="bg-surface-2 border border-dashed border-line p-3 rounded-2xl flex flex-col items-center justify-center text-muted hover:border-accent hover:text-accent transition-colors h-[72px]"
                  >
                    <span className="text-xl font-black">+</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Player Market (5 columns) */}
          <div
            className={`lg:col-span-5 card p-4 sm:p-6 flex flex-col h-[600px] lg:h-[calc(100vh-12rem)] lg:min-h-[720px] ${
              mobileTab !== "market" ? "hidden lg:flex" : ""
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h2 className="font-display font-black text-lg sm:text-xl text-ink tracking-tight uppercase">
                {t("squad.market")}
              </h2>
              <span className="text-xs font-bold text-muted tabular-nums">
                {t("squad.resultsCount", { n: sortedMarketPlayers.length })}
              </span>
            </div>

            {/* Market Search & Filters */}
            <div className="space-y-2.5 py-3 border-b border-line">
              {/* Search input with clear */}
              <div className="relative">
                <IconSearch className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("squad.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setFilters({ search: e.target.value })}
                  className="w-full bg-surface-2 border border-line text-ink text-sm rounded-xl pl-10 pr-9 py-2.5 focus:border-accent focus:outline-none transition-colors placeholder:text-muted"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setFilters({ search: "" })}
                    aria-label={t("squad.clearSearch")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  >
                    <IconX className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Position Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(["ALL", Position.GK, Position.DEF, Position.MID, Position.FWD] as const).map(
                  (pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setFilters({ position: pos })}
                      className={`h-8 px-3 rounded-lg font-display font-black text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-all select-none ${
                        activePositionFilter === pos
                          ? "bg-accent text-on-accent shadow-sm"
                          : "bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 border border-line"
                      }`}
                    >
                      {pos === "ALL" ? t("pos.ALL") : pos}
                    </button>
                  )
                )}
              </div>

              {/* Dropdowns row: Club + Sort */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activeClubFilter}
                  onChange={(e) => setFilters({ clubId: e.target.value })}
                  className="bg-surface-2 border border-line text-ink text-xs font-bold rounded-xl px-2.5 py-2 focus:border-accent focus:outline-none transition-colors truncate"
                >
                  <option value="ALL">{t("squad.allClubs")}</option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-surface-2 border border-line text-ink text-xs font-bold rounded-xl px-2.5 py-2 focus:border-accent focus:outline-none transition-colors truncate"
                >
                  <option value="priceDesc">{t("squad.sort.priceDesc")}</option>
                  <option value="priceAsc">{t("squad.sort.priceAsc")}</option>
                  <option value="points">{t("squad.sort.points")}</option>
                  <option value="name">{t("squad.sort.name")}</option>
                </select>
              </div>
            </div>

            {/* Market Player List */}
            <div className="flex-1 overflow-y-auto divide-y divide-line pr-1">
              {loading ? (
                <div className="py-12 text-center text-sm font-bold text-muted">
                  {t("squad.scouting")}
                </div>
              ) : sortedMarketPlayers.length === 0 ? (
                <div className="py-12 text-center text-sm font-bold text-muted">
                  {t("squad.noMatch")}
                </div>
              ) : (
                sortedMarketPlayers.map((player) => {
                  const isSelected = selectedPlayers.some((p) => p.id === player.id);
                  const nextFixture = player.upcomingFixtures?.[0];
                  const nextFixtureTag = nextFixture
                    ? formatFixtureOpponentTag(
                        nextFixture.opponentShortName,
                        nextFixture.isHome,
                        {
                          home: t("player.home"),
                          away: t("player.away"),
                        }
                      )
                    : null;

                  return (
                    <div
                      key={player.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setModalState({
                          player,
                          mode: "market",
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setModalState({
                            player,
                            mode: "market",
                          });
                        }
                      }}
                      className="py-2.5 px-1.5 flex items-center justify-between gap-3 hover:bg-surface-2 rounded-xl transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ClubCrest
                          name={player.club.name}
                          shortName={player.club.shortName}
                          logoUrl={player.club.logoUrl}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-black text-xs sm:text-sm text-ink truncate group-hover:text-accent transition-colors">
                              {player.firstName} {player.lastName}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted uppercase font-bold mt-0.5 flex-wrap">
                            <span className="text-accent-text font-black">
                              {t(`pos.${player.position}`)}
                            </span>
                            <span>•</span>
                            <span className="truncate">
                              {formatClubDisplayName(player.club, t)}
                            </span>
                            {nextFixture && nextFixtureTag && (
                              <>
                                <span>•</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded border text-[9px] font-display font-black tabular-nums ${getFdrBadgeClasses(
                                    nextFixture.fdr
                                  )}`}
                                >
                                  {nextFixtureTag}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right tabular-nums">
                          <div className="font-display font-black text-xs sm:text-sm text-ink">
                            £{Number(player.price).toFixed(1)}m
                          </div>
                          <div className="text-[10px] font-bold text-muted">
                            {player.totalPoints ?? 0} {t("nav.pts")}
                            {player.selectedByPercent !== undefined && (
                              <span className="ml-1.5 text-[9px] text-muted/80">
                                ({Number(player.selectedByPercent).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isSelected && !isDeadlineLocked) {
                              const added = addPlayer(player);
                              if (added) {
                                setSaveMessage(t("squad.added", { name: player.lastName }));
                              }
                            }
                          }}
                          disabled={isSelected || isDeadlineLocked}
                          aria-label={
                            isSelected
                              ? `${player.lastName} in squad`
                              : `Add ${player.lastName}`
                          }
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm transition-all select-none ${
                            isSelected
                              ? "bg-surface-3 text-muted cursor-not-allowed"
                              : isDeadlineLocked
                              ? "bg-surface-2 text-muted cursor-not-allowed"
                              : "bg-accent/15 text-accent-text hover:bg-accent hover:text-on-accent shadow-sm"
                          }`}
                        >
                          {isSelected ? <IconCheck className="w-4 h-4" /> : "+"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      <KffAttributionFooter />
      <MobileTabBar />
    </div>
  );
}
