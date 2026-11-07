"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell, { GameweekStepper } from "../../components/PageShell";
import { FixtureItem, FixturesApiData } from "../../lib/types";
import { useTranslation, intlLocale } from "../../lib/i18n";
import ClubCrest from "../../components/ClubCrest";
import { IconCalendar } from "../../components/Icons";

function formatDay(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return new Date(iso).toDateString();
  }
}

function formatTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "00:00";
  }
}

function FixtureRow({ fixture, locale }: { fixture: FixtureItem; locale: string }) {
  const { t } = useTranslation();
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;
  const isOff = fixture.status === "POSTPONED" || fixture.status === "CANCELLED";

  let centre: React.ReactNode;
  if (isOff) {
    centre = (
      <span className="px-2.5 py-1 rounded-lg bg-warning/15 border border-warning/30 text-warning-text font-display font-black text-[10px] uppercase">
        {fixture.status === "POSTPONED" ? t("fixtures.postponed") : t("fixtures.cancelled")}
      </span>
    );
  } else if (hasScore) {
    centre = (
      <div className="flex flex-col items-center">
        <span
          className={`px-3 py-1 rounded-xl font-display font-black text-sm sm:text-base tabular-nums whitespace-nowrap border ${
            fixture.status === "LIVE"
              ? "bg-danger/20 text-danger-text border-danger/40 animate-pulse"
              : "bg-surface-2 text-ink border-line"
          }`}
        >
          {fixture.homeScore} – {fixture.awayScore}
        </span>
        <span className="text-[9px] font-display font-bold uppercase tracking-wider text-muted mt-0.5">
          {fixture.status === "LIVE" ? t("fixtures.live") : t("fixtures.ft")}
        </span>
      </div>
    );
  } else {
    centre = (
      <span className="px-3 py-1.5 rounded-xl bg-surface-2 border border-line text-ink text-xs font-display font-bold tabular-nums whitespace-nowrap">
        {formatTime(fixture.kickoffTime, locale)}
      </span>
    );
  }

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 px-3 sm:px-6 py-3.5 hover:bg-surface-2/60 transition-colors">
      {/* Home Club */}
      <div className="flex items-center justify-end gap-2 sm:gap-3 text-right min-w-0">
        <span className="text-xs sm:text-sm font-display font-bold text-ink truncate">
          {fixture.homeClub.name}
        </span>
        <ClubCrest
          name={fixture.homeClub.name}
          shortName={fixture.homeClub.shortName}
          logoUrl={fixture.homeClub.logoUrl}
          size="md"
        />
        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-surface-3 border border-line text-[10px] font-display font-black text-muted shrink-0">
          {fixture.homeClub.shortName}
        </span>
      </div>

      {/* Middle Score Bug */}
      <div className="flex flex-col items-center justify-center min-w-[76px] sm:min-w-[96px]">
        {centre}
      </div>

      {/* Away Club */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-surface-3 border border-line text-[10px] font-display font-black text-muted shrink-0">
          {fixture.awayClub.shortName}
        </span>
        <ClubCrest
          name={fixture.awayClub.name}
          shortName={fixture.awayClub.shortName}
          logoUrl={fixture.awayClub.logoUrl}
          size="md"
        />
        <span className="text-xs sm:text-sm font-display font-bold text-ink truncate">
          {fixture.awayClub.name}
        </span>
      </div>
    </li>
  );
}

export default function FixturesPage() {
  const { locale, t } = useTranslation();
  const cacheRef = useRef<Map<number, FixturesApiData>>(new Map());
  const [data, setData] = useState<FixturesApiData | null>(null);
  const [requestedGw, setRequestedGw] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bcp47 = intlLocale(locale);

  const handleGameweekChange = useCallback((nextGw: number) => {
    // If nextGw is already in cache, switch immediately with 0ms lag!
    if (cacheRef.current.has(nextGw)) {
      setData(cacheRef.current.get(nextGw)!);
    }
    setRequestedGw(nextGw);
  }, []);

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
        const qs = targetGw ? `?gameweek=${targetGw}` : "";
        const res = await fetch(`/api/fixtures${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error || "Failed to load fixtures.");
          return;
        }
        if (json.data?.gameweek?.id) {
          cacheRef.current.set(json.data.gameweek.id, json.data);
        }
        setData(json.data);
      } catch {
        if (!cancelled) setError("Network error while loading fixtures.");
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

  const fixturesByDay = useMemo(() => {
    const groups = new Map<string, FixtureItem[]>();
    for (const f of data?.fixtures ?? []) {
      const key = formatDay(f.kickoffTime, bcp47);
      const list = groups.get(key) ?? [];
      list.push(f);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [data, bcp47]);

  const gw = data?.gameweek;

  return (
    <PageShell
      icon={<IconCalendar className="w-6 h-6" />}
      title={t("fixtures.title")}
      subtitle={t("fixtures.subtitle")}
      aside={
        gw && data ? (
          <GameweekStepper
            gameweekId={gw.id}
            min={data.firstGameweekId}
            max={data.lastGameweekId}
            onChange={handleGameweekChange}
            disabled={initialLoading}
          />
        ) : null
      }
    >
      {error && (
        <div role="alert" className="p-4 rounded-2xl text-sm font-bold bg-danger/15 text-danger-text border border-danger/30">
          {error}
        </div>
      )}

      {gw && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-bold">
          <span className="card px-3.5 py-1.5 text-muted">
            {t("squad.deadline", {
              date: new Date(gw.deadline).toLocaleString(bcp47, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </span>
          {gw.id === data?.activeGameweekId && (
            <span className="px-3 py-1.5 rounded-xl bg-accent/15 border border-accent/40 text-accent-text font-display font-black uppercase tracking-wider">
              {t("fixtures.currentGw")}
            </span>
          )}
          {gw.isFinished && (
            <span className="px-3 py-1.5 rounded-xl bg-surface-2 border border-line text-muted font-display font-bold uppercase tracking-wider">
              {t("fixtures.finished")}
            </span>
          )}
        </div>
      )}

      {initialLoading && !data ? (
        <div className="h-64 rounded-3xl bg-surface-2 border border-line animate-pulse" />
      ) : !data ? (
        !error && (
          <div className="card p-8 text-center text-muted font-medium">
            {t("fixtures.noGameweeks")}
          </div>
        )
      ) : fixturesByDay.length === 0 ? (
        <div className="card p-8 text-center text-muted font-medium">
          {t("fixtures.none", { id: gw?.id ?? "" })}
        </div>
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-75" : ""}`}>
          {fixturesByDay.map(([day, fixtures]) => (
            <section key={day} className="card rounded-3xl shadow-xl overflow-hidden">
              <h2 className="px-5 py-3 text-xs font-display font-black uppercase tracking-widest text-accent-text bg-surface-2 border-b border-line">
                {day}
              </h2>
              <ul className="divide-y divide-line">
                {fixtures.map((f) => (
                  <FixtureRow key={f.id} fixture={f} locale={bcp47} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
