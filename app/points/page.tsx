"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageShell, { GameweekStepper } from "../../components/PageShell";
import { ChipType, GameweekPointsPlayer, PointsApiData, Position } from "../../lib/types";
import { useTranslation } from "../../lib/i18n";

const CHIP_LABELS: Record<ChipType, string> = {
  WILDCARD: "Wildcard",
  TRIPLE_CAPTAIN: "Triple Captain",
  BENCH_BOOST: "Bench Boost",
  FREE_HIT: "Free Hit",
};

const PITCH_ROWS: Position[] = [Position.GK, Position.DEF, Position.MID, Position.FWD];

function PlayerPointsCard({ player, muted }: { player: GameweekPointsPlayer; muted?: boolean }) {
  const badge = player.isCaptain ? "C" : player.isViceCaptain ? "V" : null;
  return (
    <div
      className={`relative w-[92px] sm:w-[104px] rounded-2xl border text-center overflow-hidden shadow-lg ${
        muted ? "bg-slate-900/80 border-slate-700 opacity-80" : "bg-slate-950/90 border-slate-700"
      }`}
    >
      {badge && (
        <span
          className={`absolute top-1 right-1 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${
            player.isCaptain ? "bg-amber-400 text-slate-950" : "bg-slate-300 text-slate-900"
          }`}
          title={player.isCaptain ? `Captain (x${player.multiplier})` : "Vice-Captain"}
        >
          {badge}
        </span>
      )}
      <div className="px-2 pt-3 pb-1">
        <div className="text-[10px] font-black text-slate-400">{player.club.shortName}</div>
        <div className="text-xs font-black text-white truncate" title={`${player.firstName} ${player.lastName}`}>
          {player.lastName}
        </div>
        <div className="text-[10px] font-medium text-slate-500">
          {player.minutes > 0 ? `${player.minutes}'` : "DNP"}
        </div>
      </div>
      <div
        className={`py-1 text-sm font-black tabular-nums ${
          player.points > 0 ? "bg-emerald-500 text-white" : player.points < 0 ? "bg-red-500 text-white" : "bg-slate-700 text-slate-200"
        }`}
      >
        {player.points}
        {player.multiplier > 1 && <span className="text-[10px] font-bold opacity-80"> (x{player.multiplier})</span>}
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex-1 min-w-[120px] bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-3xl font-black tabular-nums ${accent ? "text-emerald-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

export default function PointsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<PointsApiData | null>(null);
  const [requestedGw, setRequestedGw] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = requestedGw ? `?gameweek=${requestedGw}` : "";
        const res = await fetch(`/api/points${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error || "Failed to load points.");
          return;
        }
        setData(json.data);
      } catch {
        if (!cancelled) setError("Network error while loading points.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [requestedGw]);

  const history = data?.history ?? [];
  const processedIds = history.map((h) => h.gameweekId);
  const snapshot = data?.snapshot ?? null;
  const starters = snapshot?.players.filter((p) => p.positionOrder <= 11) ?? [];
  const bench = snapshot?.players.filter((p) => p.positionOrder > 11) ?? [];
  const benchCounts = snapshot?.chipPlayed === "BENCH_BOOST";

  // Step only between gameweeks that actually have a processed snapshot.
  const stepTo = (target: number) => {
    if (!snapshot) return;
    const forward = target > snapshot.gameweekId;
    const candidates = processedIds.filter((id) => (forward ? id > snapshot.gameweekId : id < snapshot.gameweekId));
    if (candidates.length === 0) return;
    setRequestedGw(forward ? Math.min(...candidates) : Math.max(...candidates));
  };

  return (
    <PageShell
      icon="📊"
      title={t("points.title")}
      subtitle={data?.squadName ?? t("points.defaultSubtitle")}
      aside={
        snapshot && processedIds.length > 0 ? (
          <GameweekStepper
            gameweekId={snapshot.gameweekId}
            min={Math.min(...processedIds)}
            max={Math.max(...processedIds)}
            onChange={stepTo}
            disabled={loading}
          />
        ) : null
      }
    >
      {error && (
        <div role="alert" className="p-4 rounded-2xl text-sm font-bold bg-red-500/20 text-red-300 border border-red-500/30">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="h-96 rounded-3xl bg-slate-800/40 border border-slate-700/50 animate-pulse" />
      ) : data && !data.hasSquad ? (
        <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-amber-300">{t("points.noSquadTitle")}</h2>
            <p className="text-xs font-medium text-slate-300 mt-1">
              {t("points.noSquadDesc")}
            </p>
          </div>
          <Link
            href="/squad"
            className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider transition-colors self-start sm:self-auto"
          >
            {t("points.goToSquad")}
          </Link>
        </div>
      ) : data && !snapshot ? (
        <div className="p-8 text-center rounded-3xl bg-slate-800/40 border border-slate-700/50 text-slate-400 font-medium">
          {t("points.noScoredGw")}
        </div>
      ) : snapshot ? (
        <div className={`space-y-8 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div className="flex flex-wrap gap-4">
            <StatTile label={t("points.gwPoints")} value={snapshot.totalPoints} accent />
            <StatTile label={t("points.gwAverage")} value={snapshot.gameweekAverage} />
            <StatTile label={t("points.gwHighest")} value={snapshot.gameweekHighest} />
            <StatTile label={t("points.gwRank")} value={snapshot.rank ?? "—"} />
            <StatTile label={t("points.seasonTotal")} value={data?.seasonTotalPoints ?? 0} />
          </div>

          {snapshot.chipPlayed && (
            <div className="inline-flex px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-300 text-xs font-black uppercase tracking-wider">
              {t("points.chipPlayed", { chip: CHIP_LABELS[snapshot.chipPlayed] })}
            </div>
          )}

          {/* Pitch */}
          <section className="rounded-3xl border border-emerald-800/60 bg-gradient-to-b from-emerald-900/60 to-emerald-950/80 p-4 sm:p-8 shadow-xl space-y-6">
            {PITCH_ROWS.map((pos) => {
              const row = starters.filter((p) => p.position === pos);
              if (row.length === 0) return null;
              return (
                <div key={pos} className="flex justify-center flex-wrap gap-3 sm:gap-6">
                  {row.map((p) => (
                    <PlayerPointsCard key={p.playerId} player={p} />
                  ))}
                </div>
              );
            })}
          </section>

          {/* Bench */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-5 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
              {benchCounts ? t("points.benchActive") : t("points.benchInactive")}
            </h2>
            <div className="flex flex-wrap gap-3 sm:gap-6">
              {bench.map((p) => (
                <PlayerPointsCard key={p.playerId} player={p} muted={!benchCounts} />
              ))}
            </div>
          </section>

          {/* Season history */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-3xl shadow-xl overflow-hidden">
            <h2 className="px-5 py-3 text-xs font-black uppercase tracking-widest text-emerald-400 bg-slate-950/40 border-b border-slate-700/50">
              {t("points.seasonHistory")}
            </h2>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="text-left px-5 py-2">{t("points.colGw")}</th>
                  <th className="text-right px-5 py-2">{t("points.colPoints")}</th>
                  <th className="text-right px-5 py-2">{t("points.colRank")}</th>
                  <th className="text-right px-5 py-2">{t("points.colChip")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {history.map((h) => (
                  <tr
                    key={h.gameweekId}
                    onClick={() => setRequestedGw(h.gameweekId)}
                    className={`cursor-pointer hover:bg-slate-800/60 ${
                      h.gameweekId === snapshot.gameweekId ? "bg-emerald-500/10" : ""
                    }`}
                  >
                    <td className="px-5 py-2 font-bold">GW {h.gameweekId}</td>
                    <td className="px-5 py-2 text-right font-black tabular-nums">{h.totalPoints}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-300">{h.rank ?? "—"}</td>
                    <td className="px-5 py-2 text-right text-xs text-slate-400">
                      {h.chipPlayed ? CHIP_LABELS[h.chipPlayed] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </PageShell>
  );
}

