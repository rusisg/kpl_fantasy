"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell, { GameweekStepper } from "../../components/PageShell";
import { FixtureItem, FixturesApiData } from "../../lib/types";
import { useTranslation } from "../../lib/i18n";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function FixtureRow({ fixture }: { fixture: FixtureItem }) {
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;
  const isOff = fixture.status === "POSTPONED" || fixture.status === "CANCELLED";

  let centre: React.ReactNode;
  if (isOff) {
    centre = (
      <span className="px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase">
        {fixture.status === "POSTPONED" ? "Postponed" : "Cancelled"}
      </span>
    );
  } else if (hasScore) {
    centre = (
      <span
        className={`px-3 py-1 rounded-lg font-black text-lg tabular-nums ${
          fixture.status === "LIVE"
            ? "bg-red-500/20 text-red-300 border border-red-500/40"
            : "bg-slate-950 text-white border border-slate-700"
        }`}
      >
        {fixture.homeScore} – {fixture.awayScore}
      </span>
    );
  } else {
    centre = (
      <span className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-sm font-bold tabular-nums">
        {formatTime(fixture.kickoffTime)}
      </span>
    );
  }

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition-colors">
      <div className="flex items-center justify-end gap-3 text-right min-w-0">
        <span className="font-bold text-white truncate">{fixture.homeClub.name}</span>
        {fixture.homeClub.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={fixture.homeClub.logoUrl}
            alt={fixture.homeClub.name}
            className="w-7 h-7 object-contain shrink-0"
          />
        )}
        <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-[10px] font-black text-slate-300">
          {fixture.homeClub.shortName}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1 min-w-[96px]">
        {centre}
        {fixture.status === "LIVE" && (
          <span className="text-[10px] font-black uppercase tracking-wider text-red-400 animate-pulse">
            Live
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-[10px] font-black text-slate-300">
          {fixture.awayClub.shortName}
        </span>
        {fixture.awayClub.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={fixture.awayClub.logoUrl}
            alt={fixture.awayClub.name}
            className="w-7 h-7 object-contain shrink-0"
          />
        )}
        <span className="font-bold text-white truncate">{fixture.awayClub.name}</span>
      </div>
    </li>
  );
}

export default function FixturesPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FixturesApiData | null>(null);
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
        const res = await fetch(`/api/fixtures${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error || "Failed to load fixtures.");
          return;
        }
        setData(json.data);
      } catch {
        if (!cancelled) setError("Network error while loading fixtures.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [requestedGw]);

  const fixturesByDay = useMemo(() => {
    const groups = new Map<string, FixtureItem[]>();
    for (const f of data?.fixtures ?? []) {
      const key = formatDay(f.kickoffTime);
      const list = groups.get(key) ?? [];
      list.push(f);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [data]);

  const gw = data?.gameweek;

  return (
    <PageShell
      icon="📅"
      title={t("fixtures.title")}
      subtitle={t("fixtures.subtitle")}
      aside={
        gw && data ? (
          <GameweekStepper
            gameweekId={gw.id}
            min={data.firstGameweekId}
            max={data.lastGameweekId}
            onChange={setRequestedGw}
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

      {gw && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300">
            {t("squad.deadline", {
              date: new Date(gw.deadline).toLocaleString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </span>
          {gw.id === data?.activeGameweekId && (
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 uppercase tracking-wider">
              {t("fixtures.currentGw")}
            </span>
          )}
          {gw.isFinished && (
            <span className="px-3 py-1.5 rounded-xl bg-slate-700/40 border border-slate-600 text-slate-300 uppercase tracking-wider">
              {t("fixtures.finished")}
            </span>
          )}
        </div>
      )}

      {loading && !data ? (
        <div className="h-64 rounded-3xl bg-slate-800/40 border border-slate-700/50 animate-pulse" />
      ) : !data ? (
        !error && (
          <div className="p-8 text-center rounded-3xl bg-slate-800/40 border border-slate-700/50 text-slate-400 font-medium">
            No gameweeks have been scheduled yet.
          </div>
        )
      ) : fixturesByDay.length === 0 ? (
        <div className="p-8 text-center rounded-3xl bg-slate-800/40 border border-slate-700/50 text-slate-400 font-medium">
          No fixtures scheduled for Gameweek {gw?.id}.
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {fixturesByDay.map(([day, fixtures]) => (
            <section
              key={day}
              className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl shadow-xl overflow-hidden"
            >
              <h2 className="px-5 py-3 text-xs font-black uppercase tracking-widest text-emerald-400 bg-slate-950/40 border-b border-slate-700/50">
                {day}
              </h2>
              <ul className="divide-y divide-slate-700/40">
                {fixtures.map((f) => (
                  <FixtureRow key={f.id} fixture={f} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}

