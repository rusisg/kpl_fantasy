"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PageShell from "../../components/PageShell";
import ClubCrest from "../../components/ClubCrest";
import { ClubInfo, LeagueSummary } from "../../lib/types";
import {
  formatClubDisplayName,
  formatLeagueDisplayName,
  useTranslation,
} from "../../lib/i18n";
import {
  IconTrophy,
  IconCopy,
  IconCheck,
  IconShare,
  IconSearch,
  IconX,
} from "../../components/Icons";

export default function MiniLeaguesPage() {
  const { t } = useTranslation();

  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [hasSquad, setHasSquad] = useState<boolean>(true);
  const [favoriteClub, setFavoriteClub] = useState<ClubInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals ("create" | "join" | null)
  const [activeModal, setActiveModal] = useState<"create" | "join" | null>(null);

  // Create League Form
  const [newLeagueName, setNewLeagueName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [creating, setCreating] = useState(false);

  // Join League Form
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [joining, setJoining] = useState(false);

  // Leaderboard UX: inline search & Jump to My Rank
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightMyRow, setHighlightMyRow] = useState(false);
  const myRowRef = useRef<HTMLTableRowElement | null>(null);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/leagues");
        const json = await res.json();
        if (json.success) {
          const list: LeagueSummary[] = json.data ?? [];
          setLeagues(list);
          setHasSquad(Boolean(json.hasSquad));
          setFavoriteClub(json.favoriteClub ?? null);
          if (list.length > 0) {
            setSelectedLeagueId((prev) => prev ?? list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch leagues:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Close modal on Escape
  useEffect(() => {
    if (!activeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeModal]);

  const overallLeague = useMemo(
    () => leagues.find((l) => l.slug === "overall") ?? null,
    [leagues]
  );

  const clubSupportersLeague = useMemo(
    () =>
      leagues.find(
        (l) =>
          (l.isSystem && l.slug !== "overall") ||
          Boolean(l.slug?.startsWith("fans-"))
      ) ?? null,
    [leagues]
  );

  const customLeagues = useMemo(
    () =>
      leagues.filter(
        (l) => !l.isSystem && l.slug !== "overall" && !l.slug?.startsWith("fans-")
      ),
    [leagues]
  );

  const activeLeague = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId) ?? leagues[0] ?? null,
    [leagues, selectedLeagueId]
  );

  const filteredStandings = useMemo(() => {
    if (!activeLeague) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeLeague.standings;
    return activeLeague.standings.filter(
      (row) =>
        row.teamName.toLowerCase().includes(q) ||
        row.managerName.toLowerCase().includes(q)
    );
  }, [activeLeague, searchQuery]);

  const hasCurrentUserInActiveLeague = useMemo(
    () => Boolean(activeLeague?.standings.some((r) => r.isCurrentUser)),
    [activeLeague]
  );

  const handleSelectLeague = (id: string) => {
    setSelectedLeagueId(id);
    setSearchQuery("");
  };

  const handleJumpToMyRank = () => {
    if (!activeLeague) return;
    if (searchQuery.trim()) {
      setSearchQuery("");
    }
    setTimeout(() => {
      if (myRowRef.current) {
        myRowRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setHighlightMyRow(true);
        setTimeout(() => setHighlightMyRow(false), 1800);
      }
    }, 40);
  };

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeagueName.trim()) return;

    setCreating(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          name: newLeagueName.trim(),
          isPrivate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMessage({
          type: "error",
          text: data.error || t("common.genericError"),
        });
        return;
      }

      const updated: LeagueSummary[] = data.data ?? [];
      setLeagues(updated);
      if (data.leagueId) {
        setSelectedLeagueId(data.leagueId);
        setSearchQuery("");
      }
      setNewLeagueName("");
      setActiveModal(null);
      setStatusMessage({
        type: "success",
        text: t("leagues.created", {
          name: newLeagueName.trim(),
          code: data.code,
        }),
      });
    } catch {
      setStatusMessage({
        type: "error",
        text: t("common.networkError"),
      });
    } finally {
      setCreating(false);
    }
  };

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;

    setJoining(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "JOIN",
          code: inviteCodeInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMessage({
          type: "error",
          text: data.error || t("common.genericError"),
        });
        return;
      }

      const updated: LeagueSummary[] = data.data ?? [];
      setLeagues(updated);
      if (data.leagueId) {
        setSelectedLeagueId(data.leagueId);
        setSearchQuery("");
      }
      const joinedLeague = updated.find((l) => l.id === data.leagueId);
      setInviteCodeInput("");
      setActiveModal(null);
      setStatusMessage({
        type: "success",
        text: t("leagues.joined", {
          name: joinedLeague
            ? formatLeagueDisplayName(joinedLeague, t)
            : inviteCodeInput.trim(),
        }),
      });
    } catch {
      setStatusMessage({
        type: "error",
        text: t("common.networkError"),
      });
    } finally {
      setJoining(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
      } catch {
        // Clipboard error
      }
    }
  };

  const handleShareLeague = async (league: LeagueSummary) => {
    const displayName = formatLeagueDisplayName(league, t);
    const text = t("leagues.inviteText", { name: displayName, code: league.code });
    const url =
      typeof window !== "undefined" ? `${window.location.origin}/leagues` : "";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `KPL Fantasy · ${displayName}`,
          text,
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopiedCode(league.code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const resolvedClubInfo = clubSupportersLeague?.club ?? favoriteClub ?? null;

  return (
    <PageShell
      icon={<IconTrophy className="w-6 h-6" />}
      title={t("leagues.title")}
      subtitle={t("leagues.subtitle")}
      aside={
        <div className="flex items-center gap-3 bg-surface p-2 rounded-2xl border border-line">
          <div className="text-center px-3 border-r border-line">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t("leagues.activeLeagues")}
            </div>
            <div className="text-xl font-display font-black text-ink tabular-nums">
              {leagues.length}
            </div>
          </div>
          <div className="text-center px-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t("leagues.bestRank")}
            </div>
            <div className="text-xl font-display font-black text-accent-text tabular-nums">
              {leagues.reduce<number | null>((best, l) => {
                if (!l.userRank) return best;
                return best === null ? l.userRank : Math.min(best, l.userRank);
              }, null) ?? "—"}
            </div>
          </div>
        </div>
      }
    >
      {!loading && !hasSquad && (
        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-warning/30 bg-warning/5">
          <div>
            <h2 className="font-display font-black text-lg text-warning-text">
              {t("leagues.needSquadTitle")}
            </h2>
            <p className="text-xs font-medium text-muted mt-1 max-w-md">
              {t("leagues.needSquadDesc")}
            </p>
          </div>
          <Link
            href="/squad"
            className="h-11 px-6 rounded-xl bg-accent text-on-accent font-display font-black text-xs uppercase tracking-wider flex items-center justify-center transition-all shadow-md shadow-accent/20 self-start sm:self-auto whitespace-nowrap"
          >
            {t("leagues.goToSquad")} →
          </Link>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-lg ${
            statusMessage.type === "success"
              ? "bg-success/15 border border-success/30 text-success-text"
              : "bg-danger/15 border border-danger/30 text-danger-text"
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label={t("common.close")}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* 1. PUBLIC LEAGUES SECTION (Overall Kazakhstan & Club Supporters)  */}
      {/* ================================================================= */}
      <section aria-label={t("leagues.publicSectionTitle")} className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1">
          <div>
            <div className="kicker text-accent-text">
              {t("leagues.systemTag")}
            </div>
            <h2 className="font-display font-black text-lg sm:text-xl text-ink uppercase tracking-tight">
              {t("leagues.publicSectionTitle")}
            </h2>
          </div>
          <p className="text-xs text-muted font-medium">
            {t("leagues.publicSectionDesc")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* Overall Kazakhstan Card */}
          {overallLeague ? (
            <button
              type="button"
              onClick={() => handleSelectLeague(overallLeague.id)}
              className={`card p-5 sm:p-6 text-left transition-all flex items-center justify-between gap-4 relative overflow-hidden ${
                activeLeague?.id === overallLeague.id
                  ? "border-accent bg-accent/10 shadow-lg shadow-accent/10"
                  : "hover:border-line-strong"
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-accent/15 border border-accent/35 flex items-center justify-center text-accent-text shrink-0 shadow-inner">
                  <IconTrophy className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-accent/15 text-accent-text font-display font-black text-[10px] uppercase tracking-wider">
                      {t("leagues.systemTag")}
                    </span>
                    <span className="text-[11px] font-bold text-muted tabular-nums">
                      {t("leagues.participants", {
                        n: overallLeague.memberCount,
                      })}
                    </span>
                  </div>
                  <h3 className="font-display font-black text-base sm:text-lg text-ink truncate mt-1">
                    {formatLeagueDisplayName(overallLeague, t)}
                  </h3>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {t("leagues.overallDesc")}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 pl-3 border-l border-line">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  {t("leagues.currentRank")}
                </div>
                <div className="text-2xl sm:text-3xl font-display font-black text-accent-text tabular-nums mt-0.5">
                  {overallLeague.userRank ? `#${overallLeague.userRank}` : "—"}
                </div>
                <div className="text-[10px] font-display font-bold uppercase tracking-wider text-muted mt-0.5">
                  {activeLeague?.id === overallLeague.id
                    ? t("leagues.viewStandings")
                    : t("leagues.selectToView")}
                </div>
              </div>
            </button>
          ) : (
            <div className="card p-5 sm:p-6 flex items-center justify-between text-sm font-bold text-muted">
              {t("common.loading")}
            </div>
          )}

          {/* Club Supporters League Card */}
          {clubSupportersLeague ? (
            <button
              type="button"
              onClick={() => handleSelectLeague(clubSupportersLeague.id)}
              className={`card p-5 sm:p-6 text-left transition-all flex items-center justify-between gap-4 relative overflow-hidden ${
                activeLeague?.id === clubSupportersLeague.id
                  ? "border-accent bg-accent/10 shadow-lg shadow-accent/10"
                  : "hover:border-line-strong"
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center shrink-0 p-1.5">
                  {resolvedClubInfo ? (
                    <ClubCrest
                      name={resolvedClubInfo.name}
                      shortName={resolvedClubInfo.shortName}
                      logoUrl={resolvedClubInfo.logoUrl}
                      size="lg"
                    />
                  ) : (
                    <IconTrophy className="w-6 h-6 text-accent-text" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-gold/20 text-gold-text font-display font-black text-[10px] uppercase tracking-wider">
                      {t("leagues.autoEnrolledBadge")}
                    </span>
                    <span className="text-[11px] font-bold text-muted tabular-nums">
                      {t("leagues.participants", {
                        n: clubSupportersLeague.memberCount,
                      })}
                    </span>
                  </div>
                  <h3 className="font-display font-black text-base sm:text-lg text-ink truncate mt-1">
                    {formatLeagueDisplayName(clubSupportersLeague, t)}
                  </h3>
                  <p className="text-xs text-muted truncate mt-0.5">
                    {resolvedClubInfo
                      ? t("leagues.supportersDesc", {
                          club: formatClubDisplayName(resolvedClubInfo, t),
                        })
                      : t("leagues.publicSectionDesc")}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 pl-3 border-l border-line">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  {t("leagues.currentRank")}
                </div>
                <div className="text-2xl sm:text-3xl font-display font-black text-accent-text tabular-nums mt-0.5">
                  {clubSupportersLeague.userRank
                    ? `#${clubSupportersLeague.userRank}`
                    : "—"}
                </div>
                <div className="text-[10px] font-display font-bold uppercase tracking-wider text-muted mt-0.5">
                  {activeLeague?.id === clubSupportersLeague.id
                    ? t("leagues.viewStandings")
                    : t("leagues.selectToView")}
                </div>
              </div>
            </button>
          ) : (
            <div className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-dashed">
              <div className="space-y-1">
                <div className="inline-block px-2 py-0.5 rounded-md bg-surface-2 text-muted font-display font-black text-[10px] uppercase tracking-wider">
                  {t("leagues.systemTag")}
                </div>
                <h3 className="font-display font-black text-base sm:text-lg text-ink">
                  {t("leagues.supportersFallbackTitle")}
                </h3>
                <p className="text-xs text-muted max-w-sm">
                  {t("leagues.supportersNoClubDesc")}
                </p>
              </div>
              <Link
                href="/squad"
                className="h-10 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-black text-xs uppercase tracking-wider flex items-center justify-center transition-colors shrink-0 self-start sm:self-center"
              >
                {t("leagues.goToSquad")} →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================= */}
      {/* 2. PRIVATE LEAGUES & LEADERBOARD MASTER-DETAIL GRID               */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Private & Custom Leagues Column (4 columns) */}
        <section
          aria-label={t("leagues.privateSectionTitle")}
          className="lg:col-span-4 card p-5 sm:p-6 space-y-4"
        >
          <div className="space-y-1">
            <h3 className="font-display font-black text-sm uppercase tracking-wider text-ink">
              {t("leagues.privateSectionTitle")}
            </h3>
            <p className="text-xs text-muted">
              {t("leagues.privateSectionDesc")}
            </p>
          </div>

          {/* Action Buttons to Trigger Modals */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!hasSquad}
              onClick={() => {
                setStatusMessage(null);
                setActiveModal("create");
              }}
              className="h-10 px-3 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider transition-all shadow-sm shadow-accent/20 disabled:opacity-40 whitespace-nowrap"
            >
              + {t("leagues.createBtn")}
            </button>
            <button
              type="button"
              disabled={!hasSquad}
              onClick={() => {
                setStatusMessage(null);
                setActiveModal("join");
              }}
              className="h-10 px-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40 whitespace-nowrap"
            >
              {t("leagues.joinByCodeBtn")}
            </button>
          </div>

          {/* Custom Leagues List */}
          <div className="pt-2 border-t border-line space-y-2">
            <div className="text-[10px] font-display font-black uppercase tracking-widest text-muted">
              {t("leagues.yourLeagues")} ({customLeagues.length})
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs font-bold text-muted">
                {t("common.loading")}
              </div>
            ) : customLeagues.length === 0 ? (
              <div className="py-6 px-3 rounded-2xl bg-surface-2/60 border border-dashed border-line text-center">
                <p className="text-xs text-muted leading-relaxed">
                  {t("leagues.noPrivateLeagues")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {customLeagues.map((league) => {
                  const isSelected = activeLeague?.id === league.id;
                  return (
                    <button
                      key={league.id}
                      type="button"
                      onClick={() => handleSelectLeague(league.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? "bg-accent/15 border-accent shadow-sm"
                          : "bg-surface-2 border-line hover:border-line-strong"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-display font-black text-sm text-ink truncate">
                          {league.name}
                        </div>
                        <div className="text-[11px] font-bold text-muted mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-accent-text">
                            {league.code}
                          </span>
                          <span>•</span>
                          <span className="tabular-nums">
                            {t("leagues.members", { n: league.memberCount })}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-bold uppercase text-muted">
                          {t("leagues.rank")}
                        </div>
                        <div className="text-base font-display font-black text-accent-text tabular-nums">
                          {league.userRank ? `#${league.userRank}` : "—"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Standings Leaderboard (8 columns) */}
        <section
          aria-label={t("leagues.rank")}
          className="lg:col-span-8 card p-5 sm:p-6 shadow-xl"
        >
          {!activeLeague ? (
            <div className="py-16 text-center space-y-2 text-muted">
              <div className="text-3xl">🏆</div>
              <h3 className="font-display font-black text-lg text-ink">
                {t("leagues.emptyTitle")}
              </h3>
              <p className="text-xs max-w-sm mx-auto">
                {t("leagues.emptyDesc")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header with Title + Invite Code / Share */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
                <div className="flex items-center gap-3 min-w-0">
                  {activeLeague.club ? (
                    <ClubCrest
                      name={activeLeague.club.name}
                      shortName={activeLeague.club.shortName}
                      logoUrl={activeLeague.club.logoUrl}
                      size="md"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-text shrink-0">
                      <IconTrophy className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="font-display font-black text-xl sm:text-2xl text-ink tracking-tight truncate">
                      {formatLeagueDisplayName(activeLeague, t)}
                    </h2>
                    <p className="text-xs font-bold text-muted mt-0.5 tabular-nums">
                      {t("leagues.members", { n: activeLeague.memberCount })} •{" "}
                      {activeLeague.isSystem
                        ? t("leagues.systemTag")
                        : activeLeague.isPrivate
                        ? t("leagues.privateTag")
                        : t("leagues.publicTag")}
                    </p>
                  </div>
                </div>

                {!activeLeague.isSystem && (
                  <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    <div className="bg-surface-2 border border-line px-3 py-1.5 rounded-xl flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        {t("leagues.inviteCode")}
                      </span>
                      <span className="font-mono text-xs font-black text-accent-text">
                        {activeLeague.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(activeLeague.code)}
                      title={t("common.copy")}
                      className="h-9 px-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 transition-colors"
                    >
                      {copiedCode === activeLeague.code ? (
                        <>
                          <IconCheck className="w-3.5 h-3.5 text-success-text" />
                          <span>{t("common.copied")}</span>
                        </>
                      ) : (
                        <>
                          <IconCopy className="w-3.5 h-3.5" />
                          <span>{t("common.copy")}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareLeague(activeLeague)}
                      title={t("common.share")}
                      className="h-9 px-3 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 transition-colors"
                    >
                      <IconShare className="w-3.5 h-3.5" />
                      <span>{t("common.share")}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Toolbar: Inline Search + Jump to My Rank */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <IconSearch className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("leagues.searchPlaceholder")}
                    aria-label={t("leagues.searchPlaceholder")}
                    className="w-full h-10 bg-surface-2 border border-line rounded-xl pl-10 pr-9 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label={t("leagues.clearSearch")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink transition-colors"
                    >
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {hasCurrentUserInActiveLeague && (
                  <button
                    type="button"
                    onClick={handleJumpToMyRank}
                    className="h-10 px-4 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent-text font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shrink-0 whitespace-nowrap"
                  >
                    <span>{t("leagues.jumpToMyRank")}</span>
                    {activeLeague.userRank && (
                      <span className="px-1.5 py-0.5 rounded bg-accent text-on-accent text-[10px] tabular-nums">
                        #{activeLeague.userRank}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Standings Table */}
              <div className="overflow-x-auto max-h-[540px] overflow-y-auto rounded-2xl border border-line">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr className="border-b border-line text-[10px] font-display font-black uppercase tracking-wider text-muted">
                      <th className="py-2.5 px-3 w-16">{t("leagues.rank")}</th>
                      <th className="py-2.5 px-3">{t("leagues.team")}</th>
                      <th className="py-2.5 px-3 text-right">
                        {t("leagues.gwPts")}
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        {t("leagues.totalPts")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredStandings.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-10 px-4 text-center text-xs font-bold text-muted"
                        >
                          {searchQuery.trim()
                            ? t("leagues.noSearchMatch", {
                                query: searchQuery.trim(),
                              })
                            : t("leagues.noStandings")}
                        </td>
                      </tr>
                    ) : (
                      filteredStandings.map((row) => (
                        <tr
                          key={row.memberId}
                          ref={row.isCurrentUser ? myRowRef : undefined}
                          className={`transition-all ${
                            row.isCurrentUser
                              ? `bg-accent/15 hover:bg-accent/20 border-l-4 border-l-accent ${
                                  highlightMyRow
                                    ? "ring-2 ring-inset ring-accent"
                                    : ""
                                }`
                              : "hover:bg-surface-2"
                          }`}
                        >
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-display font-black text-xs tabular-nums ${
                                row.rank === 1
                                  ? "foil-gold shadow-md"
                                  : row.rank === 2
                                  ? "bg-surface-3 text-ink border border-line-strong"
                                  : row.rank === 3
                                  ? "bg-amber-700/20 text-amber-400 border border-amber-600/30"
                                  : row.isCurrentUser
                                  ? "text-accent-text font-black"
                                  : "text-muted"
                              }`}
                            >
                              {row.rank}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-display font-black text-sm ${
                                  row.isCurrentUser
                                    ? "text-accent-text"
                                    : "text-ink"
                                }`}
                              >
                                {row.teamName}
                              </span>
                              {row.isCurrentUser && (
                                <span className="px-1.5 py-0.5 rounded bg-accent text-on-accent font-display font-black text-[9px] uppercase tracking-wider">
                                  {t("common.you")}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold text-muted">
                              {row.managerName}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-display font-bold text-xs text-ink-2 tabular-nums">
                            {row.gameweekPoints}
                          </td>
                          <td className="py-3 px-3 text-right font-display font-black text-sm sm:text-base text-accent-text tabular-nums">
                            {row.totalPoints}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ================================================================= */}
      {/* 3. CREATE & JOIN LEAGUE MODALS                                    */}
      {/* ================================================================= */}
      {activeModal === "create" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-league-modal-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModal(null);
          }}
        >
          <form
            onSubmit={handleCreateLeague}
            className="card w-full max-w-md p-6 space-y-5 shadow-2xl animate-pop-in"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="create-league-modal-title"
                  className="font-display font-black text-lg text-ink uppercase tracking-tight"
                >
                  {t("leagues.createTitle")}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {t("leagues.createDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label={t("common.close")}
                className="p-1.5 rounded-xl bg-surface-2 text-muted hover:text-ink transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                required
                autoFocus
                minLength={2}
                maxLength={50}
                placeholder={t("leagues.namePlaceholder")}
                value={newLeagueName}
                onChange={(e) => setNewLeagueName(e.target.value)}
                disabled={!hasSquad || creating}
                className="w-full bg-surface-2 border border-line text-ink text-sm rounded-xl px-4 py-3 focus:border-accent focus:outline-none transition-colors disabled:opacity-50"
              />

              <label className="inline-flex items-center gap-2 text-xs font-bold text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="rounded border-line bg-surface-2 text-accent focus:ring-accent"
                />
                <span>{t("leagues.private")}</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="h-10 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-bold text-xs uppercase tracking-wider transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={!hasSquad || creating || !newLeagueName.trim()}
                className="h-10 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider transition-all shadow-sm shadow-accent/20 disabled:opacity-40 whitespace-nowrap"
              >
                {creating ? t("leagues.creating") : t("leagues.createBtn")}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeModal === "join" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-league-modal-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModal(null);
          }}
        >
          <form
            onSubmit={handleJoinLeague}
            className="card w-full max-w-md p-6 space-y-5 shadow-2xl animate-pop-in"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="join-league-modal-title"
                  className="font-display font-black text-lg text-ink uppercase tracking-tight"
                >
                  {t("leagues.joinTitle")}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {t("leagues.joinDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label={t("common.close")}
                className="p-1.5 rounded-xl bg-surface-2 text-muted hover:text-ink transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div>
              <input
                type="text"
                required
                autoFocus
                placeholder={t("leagues.codePlaceholder")}
                value={inviteCodeInput}
                onChange={(e) =>
                  setInviteCodeInput(e.target.value.toUpperCase())
                }
                disabled={!hasSquad || joining}
                className="w-full bg-surface-2 border border-line text-ink text-sm font-mono font-bold uppercase tracking-wider rounded-xl px-4 py-3 focus:border-accent focus:outline-none transition-colors disabled:opacity-50"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="h-10 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink font-display font-bold text-xs uppercase tracking-wider transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={!hasSquad || joining || !inviteCodeInput.trim()}
                className="h-10 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider transition-all shadow-sm shadow-accent/20 disabled:opacity-40 whitespace-nowrap"
              >
                {joining ? t("leagues.joining") : t("leagues.joinBtn")}
              </button>
            </div>
          </form>
        </div>
      )}
    </PageShell>
  );
}
