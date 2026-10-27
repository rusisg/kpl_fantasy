"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import { KffAttributionFooter } from "../../components/PageShell";
import { LeagueSummary } from "../../lib/types";
import { useSquadStore } from "../../store/useSquadStore";
import { useTranslation } from "../../lib/i18n";

export default function MiniLeaguesPage() {
  const { setUserProfile, setActiveGameweek, loadSquadFromApi } =
    useSquadStore();
  const { t } = useTranslation();

  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [hasSquad, setHasSquad] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  // Create League form state
  const [newLeagueName, setNewLeagueName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [creating, setCreating] = useState(false);

  // Join League form state
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [joining, setJoining] = useState(false);

  // Feedback banner
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeaguesAndContext() {
      setLoading(true);
      try {
        const [leaguesRes, squadRes] = await Promise.all([
          fetch("/api/leagues"),
          fetch("/api/squad"),
        ]);
        const [leaguesJson, squadJson] = await Promise.all([
          leaguesRes.json(),
          squadRes.json(),
        ]);

        if (squadJson.success) {
          if (squadJson.user) setUserProfile(squadJson.user);
          if (squadJson.gameweek) setActiveGameweek(squadJson.gameweek);
          if (squadJson.data) loadSquadFromApi(squadJson.data);
        }

        if (leaguesJson.success) {
          const list: LeagueSummary[] = leaguesJson.data ?? [];
          setLeagues(list);
          setHasSquad(Boolean(leaguesJson.hasSquad));
          if (list.length > 0) {
            setSelectedLeagueId((prev) => prev ?? list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch mini-leagues:", err);
      } finally {
        setLoading(false);
      }
    }
    loadLeaguesAndContext();
  }, [loadSquadFromApi, setActiveGameweek, setUserProfile]);

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
          text: data.error || "Failed to create mini-league.",
        });
        return;
      }

      const updated: LeagueSummary[] = data.data ?? [];
      setLeagues(updated);
      if (data.leagueId) setSelectedLeagueId(data.leagueId);
      setNewLeagueName("");
      setStatusMessage({
        type: "success",
        text: data.message || "Mini-league created!",
      });
    } catch {
      setStatusMessage({
        type: "error",
        text: "Network error while creating mini-league.",
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
          text: data.error || "Failed to join mini-league.",
        });
        return;
      }

      const updated: LeagueSummary[] = data.data ?? [];
      setLeagues(updated);
      if (data.leagueId) setSelectedLeagueId(data.leagueId);
      setInviteCodeInput("");
      setStatusMessage({
        type: "success",
        text: data.message || "Joined mini-league!",
      });
    } catch {
      setStatusMessage({
        type: "error",
        text: "Network error while joining mini-league.",
      });
    } finally {
      setJoining(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const activeLeague =
    leagues.find((l) => l.id === selectedLeagueId) ?? leagues[0] ?? null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-emerald-500 selection:text-white">
      <Navbar />

      <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8">
        {/* Hero Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl shadow-lg flex items-center justify-center border-2 border-emerald-300">
              <span className="text-2xl">🏆</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white">
                {t("leagues.title")}
              </h1>
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-0.5">
                {t("leagues.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-slate-950/60 px-5 py-3 rounded-2xl border border-slate-800">
            <div className="text-center pr-4 border-r border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t("leagues.activeLeagues")}
              </div>
              <div className="text-2xl font-black text-white">
                {leagues.length}
              </div>
            </div>
            <div className="text-center pl-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t("leagues.bestRank")}
              </div>
              <div className="text-2xl font-black text-emerald-400">
                {leagues.reduce<number | null>((best, l) => {
                  if (!l.userRank) return best;
                  return best === null ? l.userRank : Math.min(best, l.userRank);
                }, null) ?? "—"}
              </div>
            </div>
          </div>
        </header>

        {!loading && !hasSquad && (
          <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-amber-300">
                Save Your 15-Man KPL Squad First
              </h2>
              <p className="text-xs font-medium text-slate-300 mt-1">
                You need an active saved squad before you can create or join a
                mini-league.
              </p>
            </div>
            <Link
              href="/squad"
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider transition-colors self-start sm:self-auto"
            >
              Go to Squad Builder →
            </Link>
          </div>
        )}

        {statusMessage && (
          <div
            role="status"
            aria-live="polite"
            className={`p-4 rounded-2xl text-sm font-bold shadow-lg ${
              statusMessage.type === "success"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-red-500/20 text-red-300 border border-red-500/30"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Create & Join Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create League Card */}
          <form
            onSubmit={handleCreateLeague}
            className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-white">
                  Create a Mini-League
                </h2>
                <p className="text-xs font-medium text-slate-400">
                  Generates a unique 6-character invite code (e.g. KPL-8X9A)
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black uppercase">
                 Commissioner
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                minLength={2}
                maxLength={50}
                placeholder="League name (e.g. Almaty Derby Cup)"
                value={newLeagueName}
                onChange={(e) => setNewLeagueName(e.target.value)}
                disabled={!hasSquad || creating}
                className="flex-1 bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!hasSquad || creating || !newLeagueName.trim()}
                className="bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-white font-black text-sm px-6 py-3 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {creating ? "Creating..." : "+ Create League"}
              </button>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              Private invite-only league
            </label>
          </form>

          {/* Join League Card */}
          <form
            onSubmit={handleJoinLeague}
            className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-white">
                  Join with Invite Code
                </h2>
                <p className="text-xs font-medium text-slate-400">
                  Enter a friend&apos;s invite code to enter their leaderboard
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-[11px] font-black uppercase">
                Instant Entry
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                placeholder="Enter code (e.g. KPL-8X9A)"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                disabled={!hasSquad || joining}
                className="flex-1 bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-2xl text-sm font-mono font-bold uppercase tracking-wider focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!hasSquad || joining || !inviteCodeInput.trim()}
                className="bg-slate-900 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/40 font-black text-sm px-6 py-3 rounded-2xl transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {joining ? "Joining..." : "Join League →"}
              </button>
            </div>

            <p className="text-[11px] font-medium text-slate-500">
              Standings update automatically whenever Gameweek points are processed.
            </p>
          </form>
        </div>

        {/* Leagues Sidebar + Standings Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* League Selector (4 cols) */}
          <div className="lg:col-span-4 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Your Mini-Leagues
            </h3>

            {loading ? (
              <div className="py-10 text-center text-sm font-bold text-slate-500">
                Loading leagues...
              </div>
            ) : leagues.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="text-sm font-bold text-slate-400">
                  You haven&apos;t joined any leagues yet.
                </div>
                <p className="text-xs text-slate-500">
                  Create a new league above or enter an invite code to start competing.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {leagues.map((league) => {
                  const isSelected = activeLeague?.id === league.id;
                  return (
                    <button
                      key={league.id}
                      type="button"
                      onClick={() => setSelectedLeagueId(league.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-500/50 shadow-lg"
                          : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/70"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-black text-white">
                          {league.name}
                        </div>
                        <div className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-2">
                          <span className="font-mono text-emerald-400">
                            {league.code}
                          </span>
                          <span>•</span>
                          <span>
                            {league.memberCount}{" "}
                            {league.memberCount === 1 ? "team" : "teams"}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          Rank
                        </div>
                        <div className="text-lg font-black text-emerald-400">
                          #{league.userRank ?? "—"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Standings Leaderboard Table (8 cols) */}
          <div className="lg:col-span-8 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-6 shadow-xl">
            {!activeLeague ? (
              <div className="py-20 text-center space-y-3">
                <div className="text-4xl">⚽</div>
                <h3 className="text-lg font-black text-white">
                  No League Selected
                </h3>
                <p className="text-xs font-medium text-slate-400 max-w-md mx-auto">
                  Create your own private KPL mini-league and share the invite
                  code with friends to track weekly and season-long standings.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-2xl font-black text-white">
                      {activeLeague.name}
                    </h2>
                    <p className="text-xs font-bold text-slate-400 mt-1">
                      {activeLeague.memberCount}{" "}
                      {activeLeague.memberCount === 1
                        ? "Manager"
                        : "Managers"}{" "}
                      • {activeLeague.isPrivate ? "Private League" : "Public League"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Invite Code
                      </span>
                      <span className="font-mono text-sm font-black text-emerald-400">
                        {activeLeague.code}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(activeLeague.code)}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-xs font-black text-slate-200 border border-slate-700 transition-colors"
                    >
                      {copiedCode === activeLeague.code ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-3 px-4 w-20">Rank</th>
                        <th className="py-3 px-4">Team & Manager</th>
                        <th className="py-3 px-4 text-right">GW Pts</th>
                        <th className="py-3 px-4 text-right">Total Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {activeLeague.standings.map((row) => (
                        <tr
                          key={row.memberId}
                          className={`transition-colors ${
                            row.isCurrentUser
                              ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                              : "hover:bg-slate-900/60"
                          }`}
                        >
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-black ${
                                row.rank === 1
                                  ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                                  : row.rank === 2
                                    ? "bg-slate-300/20 text-slate-200 border border-slate-300/40"
                                    : row.rank === 3
                                      ? "bg-amber-700/20 text-amber-400 border border-amber-600/40"
                                      : "bg-slate-900 text-slate-400 border border-slate-800"
                              }`}
                            >
                              {row.rank}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-white">
                                {row.teamName}
                              </span>
                              {row.isCurrentUser && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-bold text-slate-400 mt-0.5">
                              {row.managerName}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-sm text-slate-200">
                            {row.gameweekPoints}
                          </td>
                          <td className="py-4 px-4 text-right">
                            <span className="text-base font-black text-emerald-400">
                              {row.totalPoints}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <KffAttributionFooter />
    </div>
  );
}
