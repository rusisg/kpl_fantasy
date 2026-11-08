"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import ClubCrest from "../../components/ClubCrest";
import {
  formatClubDisplayName,
  LOCALE_LABELS,
  LOCALES,
  Locale,
  useTranslation,
} from "../../lib/i18n";
import { calculatePlayerMatchPoints } from "../../lib/scoring-engine";
import { Position } from "../../lib/types";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconLock,
  IconMoon,
  IconSparkles,
  IconSun,
  IconTrophy,
} from "../../components/Icons";

type FixtureStatusType =
  | "SCHEDULED"
  | "LIVE"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED";

interface AdminGameweekOption {
  id: number;
  deadline: string;
  isCurrent: boolean;
  isFinished: boolean;
  isLocked: boolean;
  fixtureCount: number;
  performancesCount: number;
  snapshotsCount: number;
}

interface PlayerStatForm {
  playerId: string;
  fixtureId: string;
  minutes: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  bonusPoints: number;
}

interface AdminClubPlayer {
  id: string;
  firstName: string;
  lastName: string;
  clubId: string;
  position: Position;
  price: number;
  seasonPoints: number;
  performance: Omit<PlayerStatForm, "playerId" | "fixtureId"> & {
    totalPoints: number;
  } | null;
}

interface AdminFixtureItem {
  id: string;
  gameweekId: number;
  kickoffTime: string;
  homeScore: number | null;
  awayScore: number | null;
  status: FixtureStatusType;
  homeClub: {
    id: string;
    name: string;
    shortName: string;
    logoUrl?: string | null;
  };
  awayClub: {
    id: string;
    name: string;
    shortName: string;
    logoUrl?: string | null;
  };
  homePlayers: AdminClubPlayer[];
  awayPlayers: AdminClubPlayer[];
}

interface PreviewManagerRow {
  rank: number;
  squadId: string;
  squadName: string;
  managerName: string;
  gameweekPoints: number;
  transferHit: number;
  netPoints: number;
  chipPlayed: string | null;
  captainName: string;
  autoSubsCount: number;
}

interface PreviewPlayerRow {
  playerId: string;
  firstName: string;
  lastName: string;
  clubShortName: string;
  position: Position;
  minutes: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  bonusPoints: number;
  totalPoints: number;
}

interface PreviewData {
  gameweekId: number;
  totalSquadsEvaluated: number;
  performancesEvaluated: number;
  averagePoints: number;
  highestPoints: number;
  topManagers: PreviewManagerRow[];
  topPlayers: PreviewPlayerRow[];
}

const SESSION_STORAGE_KEY = "kpl_admin_secret_token";

function formatKickoff(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const intlLocale =
    locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : "en-GB";
  return new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createDefaultStat(
  playerId: string,
  fixtureId: string,
  existing?: AdminClubPlayer["performance"]
): PlayerStatForm {
  if (existing) {
    return {
      playerId,
      fixtureId,
      minutes: existing.minutes,
      goalsScored: existing.goalsScored,
      assists: existing.assists,
      cleanSheets: existing.cleanSheets,
      goalsConceded: existing.goalsConceded,
      saves: existing.saves,
      penaltiesSaved: existing.penaltiesSaved,
      penaltiesMissed: existing.penaltiesMissed,
      yellowCards: existing.yellowCards,
      redCards: existing.redCards,
      ownGoals: existing.ownGoals,
      bonusPoints: existing.bonusPoints,
    };
  }
  return {
    playerId,
    fixtureId,
    minutes: 0,
    goalsScored: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    saves: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    bonusPoints: 0,
  };
}

function isStatNonEmpty(stat: PlayerStatForm): boolean {
  return (
    stat.minutes > 0 ||
    stat.goalsScored > 0 ||
    stat.assists > 0 ||
    stat.cleanSheets > 0 ||
    stat.goalsConceded > 0 ||
    stat.saves > 0 ||
    stat.penaltiesSaved > 0 ||
    stat.penaltiesMissed > 0 ||
    stat.yellowCards > 0 ||
    stat.redCards > 0 ||
    stat.ownGoals > 0 ||
    stat.bonusPoints > 0
  );
}

export default function AdminDashboardPage() {
  const { locale, setLocale, theme, toggleTheme, t } = useTranslation();

  // Authentication state
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminHeaderToken, setAdminHeaderToken] = useState<string>("");
  const [passcodeInput, setPasscodeInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  // Dashboard state
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [gameweeks, setGameweeks] = useState<AdminGameweekOption[]>([]);
  const [selectedGw, setSelectedGw] = useState<{
    id: number;
    deadline: string;
    isCurrent: boolean;
    isFinished: boolean;
    isLocked: boolean;
  } | null>(null);
  const [fixtures, setFixtures] = useState<AdminFixtureItem[]>([]);
  const [summary, setSummary] = useState({
    totalSquads: 0,
    performancesRecorded: 0,
    snapshotsCount: 0,
  });

  // Editable fixture scores & statuses: fixtureId -> { homeScore, awayScore, status }
  const [fixtureEdits, setFixtureEdits] = useState<
    Record<
      string,
      {
        homeScore: number | null;
        awayScore: number | null;
        status: FixtureStatusType;
      }
    >
  >({});

  // Editable player stats: playerId -> PlayerStatForm
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStatForm>>(
    {}
  );

  // Expanded fixture IDs & active club side ("HOME" | "AWAY")
  const [expandedFixtures, setExpandedFixtures] = useState<
    Record<string, boolean>
  >({});
  const [activeRosterSide, setActiveRosterSide] = useState<
    Record<string, "HOME" | "AWAY">
  >({});

  // Drawers & Modals
  const [jsonDrawerOpen, setJsonDrawerOpen] = useState(false);
  const [jsonInputText, setJsonInputText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);

  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 4500);
    },
    []
  );

  const buildAuthHeaders = useCallback(
    (extra?: Record<string, string>): HeadersInit => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(extra ?? {}),
      };
      if (adminHeaderToken) {
        headers["x-admin-secret"] = adminHeaderToken;
      }
      return headers;
    },
    [adminHeaderToken]
  );

  const loadGameweekData = useCallback(
    async (gwId?: number, overrideToken?: string) => {
      setLoadingBoard(true);
      try {
        const query = gwId ? `?gameweekId=${gwId}` : "";
        const headers: Record<string, string> = {};
        const tokenToUse = overrideToken ?? adminHeaderToken;
        if (tokenToUse) {
          headers["x-admin-secret"] = tokenToUse;
        }

        const res = await fetch(`/api/admin/gameweek${query}`, {
          headers,
          cache: "no-store",
        });

        if (res.status === 401 || res.status === 403) {
          setIsAuthenticated(false);
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to load gameweek data");
        }

        const data = (await res.json()) as {
          gameweeks: AdminGameweekOption[];
          selectedGameweek: {
            id: number;
            deadline: string;
            isCurrent: boolean;
            isFinished: boolean;
            isLocked: boolean;
          } | null;
          fixtures: AdminFixtureItem[];
          summary: {
            totalSquads: number;
            performancesRecorded: number;
            snapshotsCount: number;
          };
        };

        setGameweeks(data.gameweeks);
        setSelectedGw(data.selectedGameweek);
        setFixtures(data.fixtures);
        setSummary(data.summary);

        // Initialize form state from loaded fixtures and player performances
        const nextFixtureEdits: Record<
          string,
          {
            homeScore: number | null;
            awayScore: number | null;
            status: FixtureStatusType;
          }
        > = {};
        const nextPlayerStats: Record<string, PlayerStatForm> = {};

        for (const fix of data.fixtures) {
          nextFixtureEdits[fix.id] = {
            homeScore: fix.homeScore,
            awayScore: fix.awayScore,
            status: fix.status,
          };

          for (const hp of fix.homePlayers) {
            nextPlayerStats[hp.id] = createDefaultStat(
              hp.id,
              fix.id,
              hp.performance
            );
          }
          for (const ap of fix.awayPlayers) {
            nextPlayerStats[ap.id] = createDefaultStat(
              ap.id,
              fix.id,
              ap.performance
            );
          }
        }

        setFixtureEdits(nextFixtureEdits);
        setPlayerStats(nextPlayerStats);
      } catch (err) {
        console.error(err);
        showToast(t("common.genericError"), "error");
      } finally {
        setLoadingBoard(false);
      }
    },
    [adminHeaderToken, showToast, t]
  );

  // Check existing admin session on mount
  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const storedToken =
          typeof window !== "undefined"
            ? sessionStorage.getItem(SESSION_STORAGE_KEY) || ""
            : "";
        if (storedToken) {
          setAdminHeaderToken(storedToken);
        }

        const res = await fetch("/api/admin/auth", {
          headers: storedToken ? { "x-admin-secret": storedToken } : undefined,
        });

        if (!active) return;
        if (res.ok) {
          setIsAuthenticated(true);
          await loadGameweekData(undefined, storedToken);
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        if (active) setIsAuthenticated(false);
      } finally {
        if (active) setAuthChecking(false);
      }
    };
    void checkSession();
    return () => {
      active = false;
    };
  }, [loadGameweekData]);

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeInput.trim() || verifyingPasscode) return;

    setVerifyingPasscode(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: passcodeInput.trim() }),
      });

      const data = (await res.json().catch(() => null)) as {
        authenticated?: boolean;
        token?: string;
      } | null;

      if (res.ok && data?.authenticated) {
        const token = data.token || passcodeInput.trim();
        setAdminHeaderToken(token);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(SESSION_STORAGE_KEY, token);
        }
        setIsAuthenticated(true);
        setPasscodeInput("");
        await loadGameweekData(undefined, token);
      } else {
        setAuthError(t("admin.gate.invalid"));
      }
    } catch {
      setAuthError(t("admin.gate.invalid"));
    } finally {
      setVerifyingPasscode(false);
    }
  };

  const handleLockConsole = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" }).catch(() => {});
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setAdminHeaderToken("");
    setIsAuthenticated(false);
  };

  const updateFixtureScore = (
    fixture: AdminFixtureItem,
    side: "home" | "away",
    rawVal: string
  ) => {
    const parsed =
      rawVal.trim() === ""
        ? null
        : Math.max(0, Math.min(30, Number.parseInt(rawVal, 10) || 0));

    setFixtureEdits((prev) => {
      const current = prev[fixture.id] ?? {
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        status: fixture.status,
      };
      const nextHome = side === "home" ? parsed : current.homeScore;
      const nextAway = side === "away" ? parsed : current.awayScore;
      const bothSet = nextHome !== null && nextAway !== null;

      // Sync goalsConceded & cleanSheets on active starters (minutes >= 60)
      if (bothSet) {
        setPlayerStats((prevStats) => {
          const updated = { ...prevStats };
          for (const hp of fixture.homePlayers) {
            const st = updated[hp.id];
            if (st && st.minutes > 0) {
              updated[hp.id] = {
                ...st,
                goalsConceded: nextAway,
                cleanSheets: st.minutes >= 60 && nextAway === 0 ? 1 : 0,
              };
            }
          }
          for (const ap of fixture.awayPlayers) {
            const st = updated[ap.id];
            if (st && st.minutes > 0) {
              updated[ap.id] = {
                ...st,
                goalsConceded: nextHome,
                cleanSheets: st.minutes >= 60 && nextHome === 0 ? 1 : 0,
              };
            }
          }
          return updated;
        });
      }

      return {
        ...prev,
        [fixture.id]: {
          homeScore: nextHome,
          awayScore: nextAway,
          status: bothSet ? "FINISHED" : current.status,
        },
      };
    });
  };

  const updatePlayerStatField = (
    player: AdminClubPlayer,
    fixture: AdminFixtureItem,
    isHome: boolean,
    field: keyof Omit<PlayerStatForm, "playerId" | "fixtureId">,
    value: number
  ) => {
    const clamped = Math.max(0, value);
    const fixEdit = fixtureEdits[fixture.id];
    const opponentGoals = isHome
      ? (fixEdit?.awayScore ?? fixture.awayScore ?? 0)
      : (fixEdit?.homeScore ?? fixture.homeScore ?? 0);

    setPlayerStats((prev) => {
      const current =
        prev[player.id] ??
        createDefaultStat(player.id, fixture.id, player.performance);

      const next: PlayerStatForm = {
        ...current,
        [field]: clamped,
      };

      if (field === "minutes") {
        if (clamped === 0) {
          next.cleanSheets = 0;
          next.goalsConceded = 0;
        } else {
          next.goalsConceded = opponentGoals;
          next.cleanSheets = clamped >= 60 && opponentGoals === 0 ? 1 : 0;
        }
      }

      if (field === "goalsConceded" && next.minutes >= 60) {
        next.cleanSheets = clamped === 0 ? 1 : 0;
      }

      return {
        ...prev,
        [player.id]: next,
      };
    });
  };

  const handleAutoFillStarters90 = (
    fixture: AdminFixtureItem,
    side: "HOME" | "AWAY"
  ) => {
    const roster = side === "HOME" ? fixture.homePlayers : fixture.awayPlayers;
    const fixEdit = fixtureEdits[fixture.id];
    const opponentGoals =
      side === "HOME"
        ? (fixEdit?.awayScore ?? fixture.awayScore ?? 0)
        : (fixEdit?.homeScore ?? fixture.homeScore ?? 0);

    // Pick 1 GK, 4 DEF, 4 MID, 2 FWD as default 11 starters
    const quotas: Record<Position, number> = {
      GK: 1,
      DEF: 4,
      MID: 4,
      FWD: 2,
    };
    const counts: Record<Position, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };

    setPlayerStats((prev) => {
      const next = { ...prev };
      for (const p of roster) {
        const isStarter = counts[p.position] < quotas[p.position];
        if (isStarter) {
          counts[p.position]++;
        }
        const mins = isStarter ? 90 : 0;
        const existing =
          next[p.id] ?? createDefaultStat(p.id, fixture.id, p.performance);
        next[p.id] = {
          ...existing,
          minutes: mins,
          goalsConceded: mins > 0 ? opponentGoals : 0,
          cleanSheets: mins >= 60 && opponentGoals === 0 ? 1 : 0,
        };
      }
      return next;
    });
  };

  const handleResetFixtureStats = (fixture: AdminFixtureItem) => {
    setFixtureEdits((prev) => ({
      ...prev,
      [fixture.id]: {
        homeScore: null,
        awayScore: null,
        status: "SCHEDULED",
      },
    }));
    setPlayerStats((prev) => {
      const next = { ...prev };
      for (const p of [...fixture.homePlayers, ...fixture.awayPlayers]) {
        next[p.id] = createDefaultStat(p.id, fixture.id, null);
      }
      return next;
    });
  };

  // Collect all active/edited player performances for API submission
  const activePerformancesList = useMemo(() => {
    return Object.values(playerStats).filter(
      (st) =>
        isStatNonEmpty(st) ||
        fixtures.some((f) =>
          [...f.homePlayers, ...f.awayPlayers].some(
            (p) => p.id === st.playerId && p.performance !== null
          )
        )
    );
  }, [playerStats, fixtures]);

  const handleLifecycleAction = async (
    action: "LOCK_NOW" | "UNLOCK" | "ADVANCE_GAMEWEEK" | "SET_CURRENT"
  ) => {
    if (!selectedGw || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch("/api/admin/gameweek", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          action,
          gameweekId: selectedGw.id,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        nextGameweekId?: number;
        error?: string;
      } | null;

      if (!res.ok) {
        showToast(data?.error || t("common.genericError"), "error");
        return;
      }

      if (action === "LOCK_NOW") {
        showToast(t("admin.toast.locked", { gw: selectedGw.id }));
        await loadGameweekData(selectedGw.id);
      } else if (action === "UNLOCK") {
        showToast(t("admin.toast.unlocked", { gw: selectedGw.id }));
        await loadGameweekData(selectedGw.id);
      } else if (action === "ADVANCE_GAMEWEEK") {
        const nextId = data?.nextGameweekId ?? selectedGw.id;
        showToast(t("admin.toast.advanced", { gw: nextId }));
        await loadGameweekData(nextId);
      } else if (action === "SET_CURRENT") {
        showToast(t("admin.toast.advanced", { gw: selectedGw.id }));
        await loadGameweekData(selectedGw.id);
      }
    } catch {
      showToast(t("common.genericError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveMatchdayDraft = async () => {
    if (!selectedGw || actionBusy) return;
    setActionBusy(true);
    try {
      const fixturesPayload = Object.entries(fixtureEdits).map(
        ([fixtureId, edit]) => ({
          fixtureId,
          homeScore: edit.homeScore,
          awayScore: edit.awayScore,
          status: edit.status,
        })
      );

      const res = await fetch("/api/admin/gameweek", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          action: "SAVE_MATCHDAY",
          gameweekId: selectedGw.id,
          fixtures: fixturesPayload,
          performances: activePerformancesList,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        fixturesUpdated?: number;
        performancesUpserted?: number;
        error?: string;
      } | null;

      if (!res.ok) {
        showToast(data?.error || t("common.genericError"), "error");
        return;
      }

      showToast(
        t("admin.toast.saved", {
          fixtures: data?.fixturesUpdated ?? fixturesPayload.length,
          stats: data?.performancesUpserted ?? activePerformancesList.length,
        })
      );
      await loadGameweekData(selectedGw.id);
    } catch {
      showToast(t("common.genericError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const handlePreviewPoints = async () => {
    if (!selectedGw || previewLoading) return;
    setPreviewLoading(true);
    setPreviewDrawerOpen(true);
    try {
      const res = await fetch("/api/admin/preview-points", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          gameweekId: selectedGw.id,
          performances: activePerformancesList,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | (PreviewData & { error?: string })
        | null;

      if (!res.ok || !data) {
        showToast(data?.error || t("common.genericError"), "error");
        return;
      }

      setPreviewData(data);
    } catch {
      showToast(t("common.genericError"), "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFinalizeGameweek = async () => {
    if (!selectedGw || actionBusy) return;
    setActionBusy(true);
    try {
      const fixturesPayload = Object.entries(fixtureEdits).map(
        ([fixtureId, edit]) => ({
          fixtureId,
          homeScore: edit.homeScore,
          awayScore: edit.awayScore,
          status: edit.status,
        })
      );

      const res = await fetch("/api/admin/process-gameweek", {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          gameweekId: selectedGw.id,
          markFinished: true,
          fixtures: fixturesPayload,
          performances: activePerformancesList,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: {
          gameweekId: number;
          performancesProcessed: number;
          squadsProcessed: number;
        };
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        showToast(data?.error || t("common.genericError"), "error");
        return;
      }

      setConfirmFinalizeOpen(false);
      showToast(
        t("admin.toast.finalized", {
          gw: selectedGw.id,
          squads: data.data?.squadsProcessed ?? 0,
        })
      );
      await loadGameweekData(selectedGw.id);
    } catch {
      showToast(t("common.genericError"), "error");
    } finally {
      setActionBusy(false);
    }
  };

  const handleLoadJsonSample = () => {
    const firstFixture = fixtures[0];
    if (!firstFixture) return;

    const samplePlayers = [
      ...firstFixture.homePlayers.slice(0, 2),
      ...firstFixture.awayPlayers.slice(0, 2),
    ];

    const samplePayload = {
      fixtures: [
        {
          fixtureId: firstFixture.id,
          homeScore: 2,
          awayScore: 1,
          status: "FINISHED",
        },
      ],
      performances: samplePlayers.map((p, idx) => ({
        playerId: p.id,
        fixtureId: firstFixture.id,
        minutes: 90,
        goalsScored: idx === 0 ? 1 : 0,
        assists: idx === 1 ? 1 : 0,
        cleanSheets: 0,
        goalsConceded: idx < 2 ? 1 : 2,
        saves: p.position === "GK" ? 4 : 0,
        penaltiesSaved: 0,
        penaltiesMissed: 0,
        yellowCards: idx === 2 ? 1 : 0,
        redCards: 0,
        ownGoals: 0,
        bonusPoints: idx === 0 ? 3 : idx === 1 ? 2 : 0,
      })),
    };

    setJsonInputText(JSON.stringify(samplePayload, null, 2));
    setJsonError(null);
  };

  const handleApplyJsonImport = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonInputText) as
        | PlayerStatForm[]
        | {
            fixtures?: Array<{
              fixtureId: string;
              homeScore?: number | null;
              awayScore?: number | null;
              status?: FixtureStatusType;
            }>;
            performances?: Array<Partial<PlayerStatForm> & { playerId: string; fixtureId?: string }>;
          };

      const incomingFixtures = Array.isArray(parsed)
        ? []
        : Array.isArray(parsed.fixtures)
          ? parsed.fixtures
          : [];

      const incomingPerfs = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.performances)
          ? parsed.performances
          : null;

      if (!incomingPerfs) {
        setJsonError(t("admin.jsonDrawer.invalid"));
        return;
      }

      // Map playerId -> fixtureId for convenience if fixtureId is omitted in JSON
      const fixtureByPlayerId = new Map<string, string>();
      for (const fix of fixtures) {
        for (const p of [...fix.homePlayers, ...fix.awayPlayers]) {
          fixtureByPlayerId.set(p.id, fix.id);
        }
      }

      if (incomingFixtures.length > 0) {
        setFixtureEdits((prev) => {
          const next = { ...prev };
          for (const fx of incomingFixtures) {
            if (!fx.fixtureId || !next[fx.fixtureId]) continue;
            next[fx.fixtureId] = {
              homeScore:
                fx.homeScore !== undefined
                  ? fx.homeScore
                  : next[fx.fixtureId].homeScore,
              awayScore:
                fx.awayScore !== undefined
                  ? fx.awayScore
                  : next[fx.fixtureId].awayScore,
              status: fx.status ?? next[fx.fixtureId].status,
            };
          }
          return next;
        });
      }

      let loadedCount = 0;
      setPlayerStats((prev) => {
        const next = { ...prev };
        for (const raw of incomingPerfs) {
          if (!raw.playerId) continue;
          const resolvedFixId =
            raw.fixtureId || fixtureByPlayerId.get(raw.playerId);
          if (!resolvedFixId) continue;

          const base =
            next[raw.playerId] ??
            createDefaultStat(raw.playerId, resolvedFixId, null);

          next[raw.playerId] = {
            playerId: raw.playerId,
            fixtureId: resolvedFixId,
            minutes: Number(raw.minutes ?? base.minutes) || 0,
            goalsScored: Number(raw.goalsScored ?? base.goalsScored) || 0,
            assists: Number(raw.assists ?? base.assists) || 0,
            cleanSheets: Number(raw.cleanSheets ?? base.cleanSheets) || 0,
            goalsConceded: Number(raw.goalsConceded ?? base.goalsConceded) || 0,
            saves: Number(raw.saves ?? base.saves) || 0,
            penaltiesSaved:
              Number(raw.penaltiesSaved ?? base.penaltiesSaved) || 0,
            penaltiesMissed:
              Number(raw.penaltiesMissed ?? base.penaltiesMissed) || 0,
            yellowCards: Number(raw.yellowCards ?? base.yellowCards) || 0,
            redCards: Number(raw.redCards ?? base.redCards) || 0,
            ownGoals: Number(raw.ownGoals ?? base.ownGoals) || 0,
            bonusPoints: Number(raw.bonusPoints ?? base.bonusPoints) || 0,
          };
          loadedCount++;
        }
        return next;
      });

      setJsonDrawerOpen(false);
      showToast(t("admin.jsonDrawer.applied", { count: loadedCount }));
    } catch {
      setJsonError(t("admin.jsonDrawer.invalid"));
    }
  };

  // Passcode Gate View when unauthenticated
  if (!authChecking && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-ink relative">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-xl bg-surface-2 border border-line text-ink hover:bg-surface-3 transition-colors"
          >
            {theme === "light" ? (
              <IconMoon className="w-4 h-4" />
            ) : (
              <IconSun className="w-4 h-4" />
            )}
          </button>

          <div className="flex items-center bg-surface-2 p-0.5 rounded-xl border border-line">
            {LOCALES.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLocale(lang)}
                className={`px-2 py-1 rounded-lg text-[11px] font-display font-black tracking-wider transition-all ${
                  locale === lang
                    ? "bg-accent text-on-accent shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {LOCALE_LABELS[lang]}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-6 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-6 border border-line">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-emerald-400 p-[1px] shadow-lg shadow-accent/20">
              <div className="w-full h-full bg-canvas rounded-[15px] flex items-center justify-center text-accent">
                <IconLock className="w-6 h-6" />
              </div>
            </div>
            <div>
              <span className="text-[10px] font-display font-black uppercase tracking-widest text-accent">
                {t("admin.title")}
              </span>
              <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight text-ink uppercase mt-0.5">
                {t("admin.gate.title")}
              </h1>
              <p className="text-xs sm:text-sm text-muted mt-1">
                {t("admin.gate.subtitle")}
              </p>
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-danger/15 border border-danger/30 text-danger-text text-xs font-bold text-center"
            >
              {authError}
            </div>
          )}

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <input
              type="password"
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder={t("admin.gate.placeholder")}
              autoFocus
              className="w-full h-12 px-4 rounded-xl bg-surface-2 border border-line text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent font-mono"
            />
            <button
              type="submit"
              disabled={!passcodeInput.trim() || verifyingPasscode}
              className="h-12 w-full rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-accent/25 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <IconLock className="w-4 h-4" />
              <span>
                {verifyingPasscode
                  ? t("admin.gate.verifying")
                  : t("admin.gate.submit")}
              </span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-ink">
      <Navbar />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md animate-in fade-in slide-in-from-bottom-3">
          <div
            className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 text-xs font-bold ${
              toast.type === "error"
                ? "bg-surface border-danger/40 text-danger-text"
                : "bg-surface border-accent/40 text-ink"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                toast.type === "error" ? "bg-danger" : "bg-accent"
              }`}
            />
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-muted hover:text-ink"
            >
              <IconClose className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Mission Control Header */}
        <section className="card rounded-3xl p-5 sm:p-6 border border-line flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <IconSparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-2xl sm:text-3xl tracking-tight uppercase text-ink">
                  {t("admin.title")}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-display font-black uppercase tracking-wider bg-accent/15 text-accent-text border border-accent/30">
                  ADMIN
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted mt-0.5">
                {t("admin.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Gameweek Selector */}
            <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-xl px-3 py-1.5">
              <label
                htmlFor="admin-gw-select"
                className="text-[11px] font-display font-bold uppercase tracking-wider text-muted"
              >
                {t("admin.selectGameweek")}
              </label>
              <select
                id="admin-gw-select"
                value={selectedGw?.id ?? ""}
                onChange={(e) => {
                  const id = Number.parseInt(e.target.value, 10);
                  if (id) void loadGameweekData(id);
                }}
                className="bg-transparent text-xs font-display font-black uppercase text-ink focus:outline-none cursor-pointer"
              >
                {gameweeks.map((gw) => (
                  <option key={gw.id} value={gw.id} className="bg-surface text-ink">
                    {t("squad.gameweek", { id: gw.id })}
                    {gw.isCurrent ? " ★" : gw.isFinished ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setJsonDrawerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink transition-colors"
            >
              {t("admin.quickJsonBtn")}
            </button>

            <button
              type="button"
              onClick={handleLockConsole}
              className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-danger/15 hover:border-danger/30 hover:text-danger-text border border-line text-xs font-display font-bold uppercase tracking-wider text-muted transition-colors flex items-center gap-1.5"
            >
              <IconLock className="w-3.5 h-3.5" />
              <span>{t("admin.lockConsole")}</span>
            </button>
          </div>
        </section>

        {/* Gameweek Lifecycle Status Bar */}
        {selectedGw && (
          <section className="card rounded-3xl p-5 sm:p-6 border border-line space-y-5">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-display font-black uppercase tracking-widest text-muted">
                    {t("admin.lifecycleTitle")}
                  </span>
                  <span className="font-display font-black text-lg uppercase text-ink">
                    {t("squad.gameweek", { id: selectedGw.id })}
                  </span>
                  {selectedGw.isCurrent && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-display font-black uppercase tracking-wider bg-accent/15 text-accent-text border border-accent/30">
                      {t("admin.status.active")}
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-display font-black uppercase tracking-wider border ${
                      selectedGw.isLocked
                        ? "bg-warning/15 text-warning-text border-warning/30"
                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {selectedGw.isLocked
                      ? t("admin.status.locked")
                      : t("admin.status.open")}
                  </span>
                  {selectedGw.isFinished && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-display font-black uppercase tracking-wider bg-surface-3 text-ink-2 border border-line">
                      {t("admin.status.finished")}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted tabular-nums">
                  {t("admin.deadlineLabel")}:{" "}
                  <strong className="text-ink">
                    {formatKickoff(selectedGw.deadline, locale)}
                  </strong>
                </p>
              </div>

              {/* Lifecycle Quick-Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {!selectedGw.isCurrent && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => handleLifecycleAction("SET_CURRENT")}
                    className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink transition-colors disabled:opacity-40"
                  >
                    {t("admin.setCurrentBtn")}
                  </button>
                )}

                <button
                  type="button"
                  disabled={actionBusy || selectedGw.isLocked}
                  onClick={() => handleLifecycleAction("LOCK_NOW")}
                  className="px-3.5 py-2 rounded-xl bg-warning/15 hover:bg-warning/25 border border-warning/30 text-warning-text text-xs font-display font-black uppercase tracking-wider transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  <IconLock className="w-3.5 h-3.5" />
                  <span>{t("admin.lockNowBtn")}</span>
                </button>

                <button
                  type="button"
                  disabled={actionBusy || !selectedGw.isLocked}
                  onClick={() => handleLifecycleAction("UNLOCK")}
                  className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink transition-colors disabled:opacity-40"
                >
                  {t("admin.unlockBtn")}
                </button>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => handleLifecycleAction("ADVANCE_GAMEWEEK")}
                  className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-ink transition-colors disabled:opacity-40"
                >
                  {t("admin.advanceGwBtn")} →
                </button>
              </div>
            </div>

            {/* KPI Summary Row & Primary Scoring Actions */}
            <div className="pt-4 border-t border-line flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="grid grid-cols-3 gap-3 sm:gap-4 flex-1 max-w-xl">
                <div className="bg-surface-2 border border-line rounded-2xl p-3">
                  <div className="text-[10px] font-display font-bold uppercase tracking-wider text-muted">
                    {t("admin.registeredSquads")}
                  </div>
                  <div className="font-display font-black text-xl text-ink tabular-nums mt-0.5">
                    {summary.totalSquads}
                  </div>
                </div>
                <div className="bg-surface-2 border border-line rounded-2xl p-3">
                  <div className="text-[10px] font-display font-bold uppercase tracking-wider text-muted">
                    {t("admin.recordedStats")}
                  </div>
                  <div className="font-display font-black text-xl text-accent tabular-nums mt-0.5">
                    {activePerformancesList.length}
                  </div>
                </div>
                <div className="bg-surface-2 border border-line rounded-2xl p-3">
                  <div className="text-[10px] font-display font-bold uppercase tracking-wider text-muted">
                    {t("admin.scoredSnapshots")}
                  </div>
                  <div className="font-display font-black text-xl text-ink tabular-nums mt-0.5">
                    {summary.snapshotsCount}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleSaveMatchdayDraft}
                  className="h-11 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-black uppercase tracking-wider text-ink transition-colors disabled:opacity-40"
                >
                  {actionBusy ? t("admin.savingDraft") : t("admin.saveDraftBtn")}
                </button>

                <button
                  type="button"
                  disabled={previewLoading || actionBusy}
                  onClick={handlePreviewPoints}
                  className="h-11 px-4 rounded-xl bg-surface-3 hover:bg-accent/15 hover:border-accent/40 border border-line text-xs font-display font-black uppercase tracking-wider text-ink transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  <IconTrophy className="w-4 h-4 text-accent" />
                  <span>
                    {previewLoading
                      ? t("admin.previewing")
                      : t("admin.previewPointsBtn")}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setConfirmFinalizeOpen(true)}
                  className="h-11 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider shadow-lg shadow-accent/25 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  <IconCheck className="w-4 h-4" />
                  <span>
                    {actionBusy
                      ? t("admin.finalizing")
                      : t("admin.finalizeGwBtn")}
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Match Score & Stats Entry Board */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-black text-xl uppercase tracking-tight text-ink">
                {t("admin.boardTitle")}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t("admin.boardSubtitle")}
              </p>
            </div>
          </div>

          {loadingBoard ? (
            <div className="card rounded-3xl p-12 border border-line text-center text-sm text-muted">
              {t("common.loading")}
            </div>
          ) : (
            <div className="space-y-4">
              {fixtures.map((fixture) => {
                const edit = fixtureEdits[fixture.id] ?? {
                  homeScore: fixture.homeScore,
                  awayScore: fixture.awayScore,
                  status: fixture.status,
                };
                const isExpanded = Boolean(expandedFixtures[fixture.id]);
                const activeSide = activeRosterSide[fixture.id] ?? "HOME";
                const activePlayers =
                  activeSide === "HOME"
                    ? fixture.homePlayers
                    : fixture.awayPlayers;

                const loggedCount = [
                  ...fixture.homePlayers,
                  ...fixture.awayPlayers,
                ].filter(
                  (p) =>
                    playerStats[p.id] && isStatNonEmpty(playerStats[p.id])
                ).length;

                return (
                  <div
                    key={fixture.id}
                    className="card rounded-3xl border border-line overflow-hidden transition-all"
                  >
                    {/* Fixture Score Header Bar */}
                    <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-surface/60">
                      <div className="flex items-center gap-2 text-xs text-muted tabular-nums">
                        <span className="px-2 py-0.5 rounded-lg bg-surface-2 border border-line font-display font-bold uppercase text-[10px]">
                          {edit.status}
                        </span>
                        <span>{formatKickoff(fixture.kickoffTime, locale)}</span>
                      </div>

                      {/* Interactive Match Score Inputs */}
                      <div className="flex items-center justify-center gap-3 sm:gap-5 flex-1">
                        {/* Home Club */}
                        <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0">
                          <span className="font-display font-black text-sm sm:text-base text-ink truncate text-right">
                            {formatClubDisplayName(fixture.homeClub, t)}
                          </span>
                          <ClubCrest
                            name={fixture.homeClub.name}
                            shortName={fixture.homeClub.shortName}
                            logoUrl={fixture.homeClub.logoUrl}
                            size="md"
                          />
                        </div>

                        {/* Score Box */}
                        <div className="flex items-center gap-1.5 bg-surface-2 border border-line px-2.5 py-1.5 rounded-2xl shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            aria-label={`${fixture.homeClub.shortName} score`}
                            value={edit.homeScore ?? ""}
                            placeholder="-"
                            onChange={(e) =>
                              updateFixtureScore(
                                fixture,
                                "home",
                                e.target.value
                              )
                            }
                            className="w-11 h-9 rounded-xl bg-canvas border border-line text-center font-display font-black text-base text-ink tabular-nums focus:outline-none focus:border-accent"
                          />
                          <span className="font-display font-black text-muted px-0.5">
                            :
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            aria-label={`${fixture.awayClub.shortName} score`}
                            value={edit.awayScore ?? ""}
                            placeholder="-"
                            onChange={(e) =>
                              updateFixtureScore(
                                fixture,
                                "away",
                                e.target.value
                              )
                            }
                            className="w-11 h-9 rounded-xl bg-canvas border border-line text-center font-display font-black text-base text-ink tabular-nums focus:outline-none focus:border-accent"
                          />
                        </div>

                        {/* Away Club */}
                        <div className="flex items-center justify-start gap-2.5 flex-1 min-w-0">
                          <ClubCrest
                            name={fixture.awayClub.name}
                            shortName={fixture.awayClub.shortName}
                            logoUrl={fixture.awayClub.logoUrl}
                            size="md"
                          />
                          <span className="font-display font-black text-sm sm:text-base text-ink truncate">
                            {formatClubDisplayName(fixture.awayClub, t)}
                          </span>
                        </div>
                      </div>

                      {/* Expand Roster Sheet Toggle */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedFixtures((prev) => ({
                              ...prev,
                              [fixture.id]: !prev[fixture.id],
                            }))
                          }
                          className={`px-3.5 py-2 rounded-xl border text-xs font-display font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                            isExpanded
                              ? "bg-accent text-on-accent border-accent"
                              : "bg-surface-2 hover:bg-surface-3 border-line text-ink"
                          }`}
                        >
                          <span>
                            {isExpanded
                              ? t("admin.collapseRosters")
                              : t("admin.expandRosters", { count: loggedCount })}
                          </span>
                          {isExpanded ? (
                            <IconChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <IconChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Club Roster Sheet */}
                    {isExpanded && (
                      <div className="border-t border-line bg-surface-2/40 p-4 sm:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          {/* Club Side Switcher */}
                          <div className="flex items-center bg-surface-2 p-1 rounded-xl border border-line">
                            <button
                              type="button"
                              onClick={() =>
                                setActiveRosterSide((prev) => ({
                                  ...prev,
                                  [fixture.id]: "HOME",
                                }))
                              }
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                                activeSide === "HOME"
                                  ? "bg-accent text-on-accent shadow-sm"
                                  : "text-muted hover:text-ink"
                              }`}
                            >
                              <span>{fixture.homeClub.shortName}</span>
                              <span className="text-[10px] opacity-80">
                                ({fixture.homePlayers.length})
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveRosterSide((prev) => ({
                                  ...prev,
                                  [fixture.id]: "AWAY",
                                }))
                              }
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                                activeSide === "AWAY"
                                  ? "bg-accent text-on-accent shadow-sm"
                                  : "text-muted hover:text-ink"
                              }`}
                            >
                              <span>{fixture.awayClub.shortName}</span>
                              <span className="text-[10px] opacity-80">
                                ({fixture.awayPlayers.length})
                              </span>
                            </button>
                          </div>

                          {/* Quick Helpers */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleAutoFillStarters90(fixture, activeSide)
                              }
                              className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-[11px] font-display font-bold uppercase tracking-wider text-ink transition-colors"
                            >
                              {t("admin.autoFill90Btn")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResetFixtureStats(fixture)}
                              className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-danger/15 hover:text-danger-text border border-line text-[11px] font-display font-bold uppercase tracking-wider text-muted transition-colors"
                            >
                              {t("admin.clearMatchStatsBtn")}
                            </button>
                          </div>
                        </div>

                        {/* Roster Table */}
                        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                          <table className="w-full text-left border-collapse min-w-[920px]">
                            <thead>
                              <tr className="border-b border-line bg-surface-2 text-[10px] font-display font-black uppercase tracking-wider text-muted">
                                <th className="py-2.5 px-3">
                                  {t("admin.col.player")}
                                </th>
                                <th className="py-2.5 px-2 text-center">
                                  {t("admin.col.minutes")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.goals")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.assists")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.cs")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.gc")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.saves")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.yc")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.rc")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.penSave")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.penMiss")}
                                </th>
                                <th className="py-2.5 px-1.5 text-center">
                                  {t("admin.col.ownGoal")}
                                </th>
                                <th className="py-2.5 px-2 text-center">
                                  {t("admin.col.bonus")}
                                </th>
                                <th className="py-2.5 px-3 text-right">
                                  {t("admin.col.pts")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line text-xs">
                              {activePlayers.map((player) => {
                                const st =
                                  playerStats[player.id] ??
                                  createDefaultStat(
                                    player.id,
                                    fixture.id,
                                    player.performance
                                  );
                                const isHome = activeSide === "HOME";
                                const livePts = calculatePlayerMatchPoints({
                                  position: player.position,
                                  minutes: st.minutes,
                                  goalsScored: st.goalsScored,
                                  assists: st.assists,
                                  cleanSheets: st.cleanSheets,
                                  goalsConceded: st.goalsConceded,
                                  saves: st.saves,
                                  penaltiesSaved: st.penaltiesSaved,
                                  penaltiesMissed: st.penaltiesMissed,
                                  yellowCards: st.yellowCards,
                                  redCards: st.redCards,
                                  ownGoals: st.ownGoals,
                                  bonusPoints: st.bonusPoints,
                                });

                                return (
                                  <tr
                                    key={player.id}
                                    className={`transition-colors ${
                                      st.minutes > 0
                                        ? "bg-accent/5"
                                        : "hover:bg-surface-2/50"
                                    }`}
                                  >
                                    {/* Player Name & Position */}
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-display font-black uppercase bg-surface-2 border border-line text-muted w-9 text-center">
                                          {t(`pos.${player.position}`)}
                                        </span>
                                        <div>
                                          <div className="font-bold text-ink">
                                            {player.lastName}{" "}
                                            <span className="text-muted font-normal">
                                              {player.firstName}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Minutes with Presets (90', 60', 45', DNP) */}
                                    <td className="py-2 px-2">
                                      <div className="flex items-center justify-center gap-1">
                                        {[90, 60, 45, 0].map((preset) => {
                                          const active = st.minutes === preset;
                                          return (
                                            <button
                                              key={preset}
                                              type="button"
                                              onClick={() =>
                                                updatePlayerStatField(
                                                  player,
                                                  fixture,
                                                  isHome,
                                                  "minutes",
                                                  preset
                                                )
                                              }
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-display font-black tabular-nums transition-all ${
                                                active
                                                  ? preset > 0
                                                    ? "bg-accent text-on-accent"
                                                    : "bg-surface-3 text-ink"
                                                  : "bg-surface-2 text-muted hover:text-ink"
                                              }`}
                                            >
                                              {preset === 0
                                                ? t("admin.preset.dnp")
                                                : `${preset}'`}
                                            </button>
                                          );
                                        })}
                                        <input
                                          type="number"
                                          min={0}
                                          max={130}
                                          value={st.minutes}
                                          onChange={(e) =>
                                            updatePlayerStatField(
                                              player,
                                              fixture,
                                              isHome,
                                              "minutes",
                                              Number.parseInt(
                                                e.target.value,
                                                10
                                              ) || 0
                                            )
                                          }
                                          className="w-11 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                        />
                                      </div>
                                    </td>

                                    {/* Goals */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={15}
                                        value={st.goalsScored}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "goalsScored",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-11 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Assists */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={15}
                                        value={st.assists}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "assists",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-11 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Clean Sheet Toggle */}
                                    <td className="py-2 px-1.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "cleanSheets",
                                            st.cleanSheets === 1 ? 0 : 1
                                          )
                                        }
                                        className={`w-8 h-7 rounded-lg font-display font-black text-[10px] transition-all ${
                                          st.cleanSheets === 1
                                            ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400"
                                            : "bg-surface-2 border border-line text-muted"
                                        }`}
                                      >
                                        {st.cleanSheets === 1 ? "✓" : "—"}
                                      </button>
                                    </td>

                                    {/* Goals Conceded */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={20}
                                        value={st.goalsConceded}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "goalsConceded",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-11 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Saves */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={30}
                                        disabled={player.position !== "GK"}
                                        value={st.saves}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "saves",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-11 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink disabled:opacity-30 focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Yellow Cards */}
                                    <td className="py-2 px-1.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "yellowCards",
                                            st.yellowCards === 0 ? 1 : 0
                                          )
                                        }
                                        className={`w-8 h-7 rounded-lg font-display font-black text-[10px] transition-all ${
                                          st.yellowCards > 0
                                            ? "bg-amber-400/25 border border-amber-400/50 text-amber-300"
                                            : "bg-surface-2 border border-line text-muted"
                                        }`}
                                      >
                                        {st.yellowCards}
                                      </button>
                                    </td>

                                    {/* Red Cards */}
                                    <td className="py-2 px-1.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "redCards",
                                            st.redCards === 0 ? 1 : 0
                                          )
                                        }
                                        className={`w-8 h-7 rounded-lg font-display font-black text-[10px] transition-all ${
                                          st.redCards > 0
                                            ? "bg-danger/25 border border-danger/50 text-danger-text"
                                            : "bg-surface-2 border border-line text-muted"
                                        }`}
                                      >
                                        {st.redCards}
                                      </button>
                                    </td>

                                    {/* Penalty Saves */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={5}
                                        value={st.penaltiesSaved}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "penaltiesSaved",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-10 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Penalty Misses */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={5}
                                        value={st.penaltiesMissed}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "penaltiesMissed",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-10 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Own Goals */}
                                    <td className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={5}
                                        value={st.ownGoals}
                                        onChange={(e) =>
                                          updatePlayerStatField(
                                            player,
                                            fixture,
                                            isHome,
                                            "ownGoals",
                                            Number.parseInt(
                                              e.target.value,
                                              10
                                            ) || 0
                                          )
                                        }
                                        className="w-10 h-7 rounded-lg bg-surface-2 border border-line text-center font-bold tabular-nums text-ink focus:outline-none focus:border-accent"
                                      />
                                    </td>

                                    {/* Bonus Points (Presets: 3, 2, 1, 0) */}
                                    <td className="py-2 px-2">
                                      <div className="flex items-center justify-center gap-1">
                                        {[3, 2, 1, 0].map((b) => (
                                          <button
                                            key={b}
                                            type="button"
                                            onClick={() =>
                                              updatePlayerStatField(
                                                player,
                                                fixture,
                                                isHome,
                                                "bonusPoints",
                                                b
                                              )
                                            }
                                            className={`w-6 h-6 rounded text-[10px] font-display font-black tabular-nums transition-all ${
                                              st.bonusPoints === b && b > 0
                                                ? "bg-accent text-on-accent"
                                                : st.bonusPoints === 0 && b === 0
                                                  ? "bg-surface-3 text-ink"
                                                  : "bg-surface-2 text-muted hover:text-ink"
                                            }`}
                                          >
                                            {b}
                                          </button>
                                        ))}
                                      </div>
                                    </td>

                                    {/* Live Calculated Fantasy Points */}
                                    <td className="py-2 px-3 text-right">
                                      <span
                                        className={`inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg font-display font-black text-xs tabular-nums ${
                                          livePts >= 6
                                            ? "bg-accent text-on-accent"
                                            : livePts > 0
                                              ? "bg-surface-2 text-ink border border-line"
                                              : livePts < 0
                                                ? "bg-danger/15 text-danger-text"
                                                : "text-muted"
                                        }`}
                                      >
                                        {livePts}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Quick JSON Import Drawer */}
      {jsonDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-surface border-l border-line w-full max-w-xl h-full flex flex-col p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-black text-xl uppercase text-ink">
                  {t("admin.jsonDrawer.title")}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {t("admin.jsonDrawer.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJsonDrawerOpen(false)}
                className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-muted hover:text-ink"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleLoadJsonSample}
                className="px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-accent"
              >
                {t("admin.jsonDrawer.loadSample")}
              </button>
            </div>

            {jsonError && (
              <div className="p-3 rounded-xl bg-danger/15 border border-danger/30 text-danger-text text-xs font-bold">
                {jsonError}
              </div>
            )}

            <textarea
              value={jsonInputText}
              onChange={(e) => setJsonInputText(e.target.value)}
              placeholder='{"fixtures": [...], "performances": [{"playerId": "...", "minutes": 90, "goalsScored": 1}]}'
              className="flex-1 w-full rounded-2xl bg-surface-2 border border-line p-4 font-mono text-xs text-ink focus:outline-none focus:border-accent resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setJsonDrawerOpen(false)}
                className="h-11 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleApplyJsonImport}
                disabled={!jsonInputText.trim()}
                className="h-11 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider disabled:opacity-40"
              >
                {t("admin.jsonDrawer.applyBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scoring Preview Drawer */}
      {previewDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-surface border-l border-line w-full max-w-xl h-full flex flex-col p-6 space-y-5 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-black text-xl uppercase text-ink">
                  {t("admin.previewDrawer.title", {
                    gw: selectedGw?.id ?? "",
                  })}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {t("admin.previewDrawer.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDrawerOpen(false)}
                className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-muted hover:text-ink"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>

            {previewLoading || !previewData ? (
              <div className="py-16 text-center text-sm text-muted">
                {t("admin.previewing")}
              </div>
            ) : (
              <>
                {/* Summary Benchmarks */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-2 border border-line rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-display font-bold uppercase text-muted">
                      {t("admin.previewDrawer.avgScore")}
                    </div>
                    <div className="font-display font-black text-2xl text-ink tabular-nums mt-0.5">
                      {previewData.averagePoints}
                    </div>
                  </div>
                  <div className="bg-surface-2 border border-line rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-display font-bold uppercase text-muted">
                      {t("admin.previewDrawer.highScore")}
                    </div>
                    <div className="font-display font-black text-2xl text-accent tabular-nums mt-0.5">
                      {previewData.highestPoints}
                    </div>
                  </div>
                  <div className="bg-surface-2 border border-line rounded-2xl p-3 text-center">
                    <div className="text-[10px] font-display font-bold uppercase text-muted">
                      {t("admin.previewDrawer.squadsCount")}
                    </div>
                    <div className="font-display font-black text-2xl text-ink tabular-nums mt-0.5">
                      {previewData.totalSquadsEvaluated}
                    </div>
                  </div>
                </div>

                {/* Top 5 Scoring Managers */}
                <div className="space-y-2.5">
                  <h4 className="font-display font-black text-xs uppercase tracking-wider text-muted">
                    {t("admin.previewDrawer.topManagers")}
                  </h4>
                  {previewData.topManagers.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-surface-2 border border-line text-xs text-muted text-center">
                      {t("admin.previewDrawer.noManagers")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {previewData.topManagers.map((m) => (
                        <div
                          key={m.squadId}
                          className="p-3.5 rounded-2xl bg-surface-2 border border-line flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-7 h-7 rounded-xl bg-accent/15 border border-accent/30 font-display font-black text-xs text-accent flex items-center justify-center shrink-0 tabular-nums">
                              #{m.rank}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-ink truncate">
                                {m.squadName}
                              </div>
                              <div className="text-[11px] text-muted flex flex-wrap items-center gap-2">
                                <span>{m.managerName}</span>
                                <span>•</span>
                                <span>
                                  {t("admin.previewDrawer.captain", {
                                    name: m.captainName,
                                  })}
                                </span>
                                {m.autoSubsCount > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="text-accent">
                                      {t("admin.previewDrawer.autoSubs", {
                                        n: m.autoSubsCount,
                                      })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-display font-black text-lg text-accent tabular-nums">
                              {m.netPoints} {t("nav.pts")}
                            </div>
                            {m.transferHit > 0 && (
                              <div className="text-[10px] text-danger-text tabular-nums">
                                (-{m.transferHit})
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top 5 Fantasy Player Performers */}
                <div className="space-y-2.5">
                  <h4 className="font-display font-black text-xs uppercase tracking-wider text-muted">
                    {t("admin.previewDrawer.topPlayers")}
                  </h4>
                  {previewData.topPlayers.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-surface-2 border border-line text-xs text-muted text-center">
                      {t("admin.previewDrawer.noPlayers")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {previewData.topPlayers.map((p, idx) => (
                        <div
                          key={p.playerId}
                          className="p-3.5 rounded-2xl bg-surface-2 border border-line flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-7 h-7 rounded-xl bg-surface-3 border border-line font-display font-black text-xs text-ink flex items-center justify-center shrink-0 tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-ink truncate">
                                {p.lastName} {p.firstName}
                              </div>
                              <div className="text-[11px] text-muted flex items-center gap-2">
                                <span className="font-display font-bold text-ink-2">
                                  {p.clubShortName}
                                </span>
                                <span>•</span>
                                <span>{t(`pos.${p.position}`)}</span>
                                <span>•</span>
                                <span>{p.minutes}&apos;</span>
                                {p.goalsScored > 0 && (
                                  <span>G:{p.goalsScored}</span>
                                )}
                                {p.assists > 0 && <span>A:{p.assists}</span>}
                                {p.bonusPoints > 0 && (
                                  <span>B:+{p.bonusPoints}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="font-display font-black text-lg text-accent tabular-nums shrink-0">
                            {p.totalPoints} {t("nav.pts")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Finalize Gameweek Confirmation Modal */}
      {confirmFinalizeOpen && selectedGw && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card rounded-3xl max-w-md w-full p-6 sm:p-7 border border-line shadow-2xl space-y-5">
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                <IconTrophy className="w-6 h-6" />
              </div>
              <h3 className="font-display font-black text-xl uppercase text-ink">
                {t("admin.confirmModal.title", { gw: selectedGw.id })}
              </h3>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                {t("admin.confirmModal.desc")}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setConfirmFinalizeOpen(false)}
                className="h-11 px-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-xs font-display font-bold uppercase tracking-wider text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleFinalizeGameweek}
                className="h-11 px-5 rounded-xl bg-accent hover:opacity-90 text-on-accent font-display font-black text-xs uppercase tracking-wider shadow-lg shadow-accent/25 disabled:opacity-40"
              >
                {actionBusy
                  ? t("admin.finalizing")
                  : t("admin.confirmModal.confirmBtn", { gw: selectedGw.id })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
