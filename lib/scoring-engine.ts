import {
  ChipType,
  ClubInfo,
  GameweekPointsPlayer,
  MatchPointBreakdownItem,
  PlayerMatchFixtureSummary,
  PlayerMatchStatsDetail,
  Position,
} from "./types";

export interface PlayerMatchStatInput {
  position: Position;
  minutes: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  goalsConceded?: number;
  saves?: number;
  penaltiesSaved?: number;
  penaltiesMissed?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
  bonusPoints?: number;
}

export interface SquadMemberScoringInput {
  playerId: string;
  position: Position;
  positionOrder: number; // 1-11 starting XI, 12-15 bench
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface EvaluatedSquadSnapshotPlayer {
  playerId: string;
  positionOrder: number;
  originalPositionOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  vicePromoted: boolean;
  multiplier: number;
  basePoints: number;
  points: number; // basePoints * multiplier
  minutes: number;
  subbedIn: boolean;
  subbedOut: boolean;
  subReason: "AUTO_SUB_IN" | "AUTO_SUB_OUT_DNP" | null;
  subbedPartnerPlayerId: string | null;
}

export interface AutoSubstitutionRecord {
  playerOutId: string;
  playerInId: string;
}

export interface SquadGameweekScoreResult {
  totalPoints: number;
  captainPromotedToVice: boolean;
  substitutions: AutoSubstitutionRecord[];
  players: EvaluatedSquadSnapshotPlayer[];
}

const FORMATION_LIMITS: Record<Position, { min: number; max: number }> = {
  [Position.GK]: { min: 1, max: 1 },
  [Position.DEF]: { min: 3, max: 5 },
  [Position.MID]: { min: 2, max: 5 },
  [Position.FWD]: { min: 1, max: 3 },
};

function isValidLineupPositions(positions: Position[]): boolean {
  if (positions.length !== 11) return false;
  const counts: Record<Position, number> = {
    [Position.GK]: 0,
    [Position.DEF]: 0,
    [Position.MID]: 0,
    [Position.FWD]: 0,
  };
  for (const pos of positions) {
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return (
    counts[Position.GK] >= FORMATION_LIMITS[Position.GK].min &&
    counts[Position.GK] <= FORMATION_LIMITS[Position.GK].max &&
    counts[Position.DEF] >= FORMATION_LIMITS[Position.DEF].min &&
    counts[Position.DEF] <= FORMATION_LIMITS[Position.DEF].max &&
    counts[Position.MID] >= FORMATION_LIMITS[Position.MID].min &&
    counts[Position.MID] <= FORMATION_LIMITS[Position.MID].max &&
    counts[Position.FWD] >= FORMATION_LIMITS[Position.FWD].min &&
    counts[Position.FWD] <= FORMATION_LIMITS[Position.FWD].max
  );
}

export const GOAL_POINTS_BY_POSITION: Record<Position, number> = {
  [Position.GK]: 6,
  [Position.DEF]: 6,
  [Position.MID]: 5,
  [Position.FWD]: 4,
};

export const CLEAN_SHEET_POINTS_BY_POSITION: Record<Position, number> = {
  [Position.GK]: 4,
  [Position.DEF]: 4,
  [Position.MID]: 1,
  [Position.FWD]: 0,
};

/**
 * Pure FPL/KPL points calculator for a single player's match performance.
 *
 * Rules:
 * - Minutes Played: 0 pts (0m), 1 pt (1-59m), 2 pts (>=60m)
 * - Goals Scored: +6 (GK/DEF), +5 (MID), +4 (FWD)
 * - Assists: +3 (All positions)
 * - Clean Sheets (>=60m): +4 (GK/DEF), +1 (MID), 0 (FWD)
 * - Penalties & Discipline:
 *   -2 per penalty missed
 *   +5 per penalty saved (GK)
 *   -1 per yellow card
 *   -3 per red card
 *   -2 per own goal
 *   -1 per 2 goals conceded (GK/DEF)
 */
export function calculatePlayerMatchPoints(stat: PlayerMatchStatInput): number {
  const minutes = Math.max(0, Math.trunc(stat.minutes || 0));
  if (minutes === 0) {
    return 0;
  }

  const goalsScored = Math.max(0, Math.trunc(stat.goalsScored ?? 0));
  const assists = Math.max(0, Math.trunc(stat.assists ?? 0));
  const goalsConceded = Math.max(0, Math.trunc(stat.goalsConceded ?? 0));
  const cleanSheets =
    stat.cleanSheets !== undefined
      ? Math.max(0, Math.trunc(stat.cleanSheets))
      : minutes >= 60 && goalsConceded === 0
        ? 1
        : 0;
  const penaltiesSaved = Math.max(0, Math.trunc(stat.penaltiesSaved ?? 0));
  const penaltiesMissed = Math.max(0, Math.trunc(stat.penaltiesMissed ?? 0));
  const saves = Math.max(0, Math.trunc(stat.saves ?? 0));
  const yellowCards = Math.max(0, Math.trunc(stat.yellowCards ?? 0));
  const redCards = Math.max(0, Math.trunc(stat.redCards ?? 0));
  const ownGoals = Math.max(0, Math.trunc(stat.ownGoals ?? 0));
  const bonusPoints = Math.trunc(stat.bonusPoints ?? 0);

  let points = 0;

  // 1. Appearance points
  points += minutes >= 60 ? 2 : 1;

  // 2. Goals scored
  points += goalsScored * GOAL_POINTS_BY_POSITION[stat.position];

  // 3. Assists (+3 all positions)
  points += assists * 3;

  // 4. Clean sheet (requires 60+ minutes played)
  if (minutes >= 60 && cleanSheets > 0) {
    points += CLEAN_SHEET_POINTS_BY_POSITION[stat.position];
  }

  // 5. Goalkeeper saves (+1 per 3 saves)
  if (stat.position === Position.GK && saves >= 3) {
    points += Math.floor(saves / 3);
  }

  // 6. Goals conceded penalty (-1 per 2 goals conceded for GK and DEF)
  if (stat.position === Position.GK || stat.position === Position.DEF) {
    points -= Math.floor(goalsConceded / 2);
  }

  // 7. Penalties saved (+5 for GK) and missed (-2 for all)
  if (stat.position === Position.GK) {
    points += penaltiesSaved * 5;
  }
  points -= penaltiesMissed * 2;

  // 8. Discipline & own goals
  points -= yellowCards * 1;
  points -= redCards * 3;
  points -= ownGoals * 2;

  // 9. Optional bonus points
  points += bonusPoints;

  return points;
}

/**
 * Produces an itemized breakdown of all point sources for a player's match performance.
 * Sum of `item.points` equals `calculatePlayerMatchPoints(stat)`.
 */
export function buildPlayerPointBreakdown(
  stat: PlayerMatchStatInput
): MatchPointBreakdownItem[] {
  const minutes = Math.max(0, Math.trunc(stat.minutes || 0));
  if (minutes === 0) {
    return [{ category: "MINUTES_DNP", statValue: 0, points: 0 }];
  }

  const goalsScored = Math.max(0, Math.trunc(stat.goalsScored ?? 0));
  const assists = Math.max(0, Math.trunc(stat.assists ?? 0));
  const goalsConceded = Math.max(0, Math.trunc(stat.goalsConceded ?? 0));
  const cleanSheets =
    stat.cleanSheets !== undefined
      ? Math.max(0, Math.trunc(stat.cleanSheets))
      : minutes >= 60 && goalsConceded === 0
        ? 1
        : 0;
  const saves = Math.max(0, Math.trunc(stat.saves ?? 0));
  const penaltiesSaved = Math.max(0, Math.trunc(stat.penaltiesSaved ?? 0));
  const penaltiesMissed = Math.max(0, Math.trunc(stat.penaltiesMissed ?? 0));
  const yellowCards = Math.max(0, Math.trunc(stat.yellowCards ?? 0));
  const redCards = Math.max(0, Math.trunc(stat.redCards ?? 0));
  const ownGoals = Math.max(0, Math.trunc(stat.ownGoals ?? 0));
  const bonusPoints = Math.trunc(stat.bonusPoints ?? 0);

  const items: MatchPointBreakdownItem[] = [];

  if (minutes >= 60) {
    items.push({ category: "MINUTES_60_PLUS", statValue: minutes, points: 2 });
  } else {
    items.push({ category: "MINUTES_UNDER_60", statValue: minutes, points: 1 });
  }

  if (goalsScored > 0) {
    items.push({
      category: "GOALS",
      statValue: goalsScored,
      points: goalsScored * GOAL_POINTS_BY_POSITION[stat.position],
    });
  }

  if (assists > 0) {
    items.push({
      category: "ASSISTS",
      statValue: assists,
      points: assists * 3,
    });
  }

  if (
    minutes >= 60 &&
    cleanSheets > 0 &&
    CLEAN_SHEET_POINTS_BY_POSITION[stat.position] > 0
  ) {
    items.push({
      category: "CLEAN_SHEET",
      statValue: 1,
      points: CLEAN_SHEET_POINTS_BY_POSITION[stat.position],
    });
  }

  if (stat.position === Position.GK && saves >= 3) {
    items.push({
      category: "SAVES",
      statValue: saves,
      points: Math.floor(saves / 3),
    });
  }

  if (stat.position === Position.GK && penaltiesSaved > 0) {
    items.push({
      category: "PENALTIES_SAVED",
      statValue: penaltiesSaved,
      points: penaltiesSaved * 5,
    });
  }

  if (penaltiesMissed > 0) {
    items.push({
      category: "PENALTIES_MISSED",
      statValue: penaltiesMissed,
      points: -(penaltiesMissed * 2),
    });
  }

  if (
    (stat.position === Position.GK || stat.position === Position.DEF) &&
    Math.floor(goalsConceded / 2) > 0
  ) {
    items.push({
      category: "GOALS_CONCEDED",
      statValue: goalsConceded,
      points: -Math.floor(goalsConceded / 2),
    });
  }

  if (yellowCards > 0) {
    items.push({
      category: "YELLOW_CARDS",
      statValue: yellowCards,
      points: -yellowCards,
    });
  }

  if (redCards > 0) {
    items.push({
      category: "RED_CARDS",
      statValue: redCards,
      points: -(redCards * 3),
    });
  }

  if (ownGoals > 0) {
    items.push({
      category: "OWN_GOALS",
      statValue: ownGoals,
      points: -(ownGoals * 2),
    });
  }

  if (bonusPoints !== 0) {
    items.push({
      category: "BONUS",
      statValue: bonusPoints,
      points: bonusPoints,
    });
  }

  return items;
}

/**
 * Evaluates a 15-player squad for a Gameweek, applying:
 * 1. Automatic substitutions (unless BENCH_BOOST is played) for 0-minute starters
 *    from active bench players in bench priority order while preserving valid formations.
 * 2. Captain (`2x`, or `3x` on TRIPLE_CAPTAIN) and Vice-Captain failover (`2x`/`3x`
 *    if the Captain played 0 minutes).
 */
export function calculateSquadGameweekScore(
  squadPlayers: SquadMemberScoringInput[],
  statsByPlayerId: ReadonlyMap<
    string,
    { minutes: number; totalPoints: number }
  >,
  chipPlayed?: "WILDCARD" | "TRIPLE_CAPTAIN" | "BENCH_BOOST" | "FREE_HIT" | null
): SquadGameweekScoreResult {
  const captainMultiplier = chipPlayed === "TRIPLE_CAPTAIN" ? 3 : 2;
  const includeBench = chipPlayed === "BENCH_BOOST";

  const originalOrderByPlayerId = new Map<string, number>(
    squadPlayers.map((p) => [p.playerId, p.positionOrder])
  );

  const workingPlayers: SquadMemberScoringInput[] = squadPlayers
    .map((p) => ({ ...p }))
    .sort((a, b) => a.positionOrder - b.positionOrder);

  const substitutions: AutoSubstitutionRecord[] = [];
  const subbedInPartnerByPlayerId = new Map<string, string>();
  const subbedOutPartnerByPlayerId = new Map<string, string>();

  if (!includeBench) {
    // 1. Goalkeeper auto-sub: if starting GK played 0 mins and bench GK played > 0 mins
    const starterGk = workingPlayers.find(
      (p) => p.positionOrder <= 11 && p.position === Position.GK
    );
    const benchGk = workingPlayers.find(
      (p) => p.positionOrder > 11 && p.position === Position.GK
    );
    if (
      starterGk &&
      benchGk &&
      (statsByPlayerId.get(starterGk.playerId)?.minutes ?? 0) === 0 &&
      (statsByPlayerId.get(benchGk.playerId)?.minutes ?? 0) > 0
    ) {
      const tempOrder = starterGk.positionOrder;
      starterGk.positionOrder = benchGk.positionOrder;
      benchGk.positionOrder = tempOrder;
      substitutions.push({
        playerOutId: starterGk.playerId,
        playerInId: benchGk.playerId,
      });
      subbedOutPartnerByPlayerId.set(starterGk.playerId, benchGk.playerId);
      subbedInPartnerByPlayerId.set(benchGk.playerId, starterGk.playerId);
    }

    // 2. Outfield auto-subs: iterate bench outfielders in priority order (13, 14, 15)
    const benchOutfielders = workingPlayers
      .filter((p) => p.positionOrder > 11 && p.position !== Position.GK)
      .sort((a, b) => a.positionOrder - b.positionOrder);

    for (const benchPlayer of benchOutfielders) {
      const benchMinutes =
        statsByPlayerId.get(benchPlayer.playerId)?.minutes ?? 0;
      if (benchMinutes <= 0) continue;

      const currentStarters = workingPlayers
        .filter((p) => p.positionOrder <= 11)
        .sort((a, b) => a.positionOrder - b.positionOrder);

      const inactiveOutfieldStarters = currentStarters.filter(
        (p) =>
          p.position !== Position.GK &&
          (statsByPlayerId.get(p.playerId)?.minutes ?? 0) === 0
      );

      if (inactiveOutfieldStarters.length === 0) break;

      // Prefer replacing an inactive starter of the same position first so positional minimums remain intact,
      // then fall back to the first inactive starter in positionOrder that keeps the 11-man formation legal.
      const orderedCandidates = [
        ...inactiveOutfieldStarters.filter(
          (s) => s.position === benchPlayer.position
        ),
        ...inactiveOutfieldStarters.filter(
          (s) => s.position !== benchPlayer.position
        ),
      ];

      const validTarget = orderedCandidates.find((starterOut) => {
        const nextPositions = currentStarters.map((s) =>
          s.playerId === starterOut.playerId ? benchPlayer.position : s.position
        );
        return isValidLineupPositions(nextPositions);
      });

      if (validTarget) {
        const tempOrder = validTarget.positionOrder;
        validTarget.positionOrder = benchPlayer.positionOrder;
        benchPlayer.positionOrder = tempOrder;
        substitutions.push({
          playerOutId: validTarget.playerId,
          playerInId: benchPlayer.playerId,
        });
        subbedOutPartnerByPlayerId.set(validTarget.playerId, benchPlayer.playerId);
        subbedInPartnerByPlayerId.set(benchPlayer.playerId, validTarget.playerId);
      }
    }
  }

  const captain = workingPlayers.find((p) => p.isCaptain);
  const viceCaptain = workingPlayers.find((p) => p.isViceCaptain);

  const captainMinutes = captain
    ? (statsByPlayerId.get(captain.playerId)?.minutes ?? 0)
    : 0;
  const viceMinutes = viceCaptain
    ? (statsByPlayerId.get(viceCaptain.playerId)?.minutes ?? 0)
    : 0;

  const captainPromotedToVice = captainMinutes === 0 && viceMinutes > 0;

  let totalPoints = 0;

  const evaluatedPlayers: EvaluatedSquadSnapshotPlayer[] = workingPlayers
    .slice()
    .sort((a, b) => a.positionOrder - b.positionOrder)
    .map((sp) => {
      const perf = statsByPlayerId.get(sp.playerId);
      const minutes = perf?.minutes ?? 0;
      const basePoints = perf?.totalPoints ?? 0;

      const isStarter = sp.positionOrder <= 11;
      let multiplier = 1;
      let vicePromoted = false;
      if (isStarter) {
        if (sp.isCaptain && captainMinutes > 0) {
          multiplier = captainMultiplier;
        } else if (sp.isViceCaptain && captainPromotedToVice) {
          multiplier = captainMultiplier;
          vicePromoted = true;
        }
      }

      const effectivePoints = basePoints * multiplier;

      if (isStarter || includeBench) {
        totalPoints += effectivePoints;
      }

      const subbedIn = subbedInPartnerByPlayerId.has(sp.playerId);
      const subbedOut = subbedOutPartnerByPlayerId.has(sp.playerId);
      const subbedPartnerPlayerId =
        subbedInPartnerByPlayerId.get(sp.playerId) ??
        subbedOutPartnerByPlayerId.get(sp.playerId) ??
        null;

      return {
        playerId: sp.playerId,
        positionOrder: sp.positionOrder,
        originalPositionOrder: originalOrderByPlayerId.get(sp.playerId) ?? sp.positionOrder,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        vicePromoted,
        multiplier,
        basePoints,
        points: effectivePoints,
        minutes,
        subbedIn,
        subbedOut,
        subReason: subbedIn
          ? "AUTO_SUB_IN"
          : subbedOut
            ? "AUTO_SUB_OUT_DNP"
            : null,
        subbedPartnerPlayerId,
      };
    });

  return {
    totalPoints,
    captainPromotedToVice,
    substitutions,
    players: evaluatedPlayers,
  };
}

export interface PriorSnapshotPlayerInput {
  playerId: string;
  positionOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface RestoredSquadPlayerRecord {
  playerId: string;
  positionOrder: number;
  purchasePrice: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface FreeHitRestorationPlan {
  players: RestoredSquadPlayerRecord[];
  remainingBudget: number;
}

/**
 * Builds a pre-Free Hit restoration plan from the previous Gameweek's SquadSnapshot.
 * Restores all 15 SquadPlayer slots (1..15), captaincy flags, and recalculates
 * the squad's remaining budget against the 100.0M salary cap.
 */
export function buildFreeHitRestoredSquad(
  previousSnapshotPlayers: PriorSnapshotPlayerInput[],
  priceByPlayerId: ReadonlyMap<string, number>,
  maxBudget = 100.0
): FreeHitRestorationPlan | null {
  if (previousSnapshotPlayers.length !== 15) {
    return null;
  }

  const players: RestoredSquadPlayerRecord[] = previousSnapshotPlayers
    .slice()
    .sort((a, b) => a.positionOrder - b.positionOrder)
    .map((sp, idx) => {
      const price = Number(priceByPlayerId.get(sp.playerId) ?? 4.0);
      return {
        playerId: sp.playerId,
        positionOrder: sp.positionOrder >= 1 && sp.positionOrder <= 15 ? sp.positionOrder : idx + 1,
        purchasePrice: Number(price.toFixed(1)),
        isCaptain: Boolean(sp.isCaptain),
        isViceCaptain: Boolean(sp.isViceCaptain),
      };
    });

  const totalSpentTenths = players.reduce(
    (sum, p) => sum + Math.round(p.purchasePrice * 10),
    0
  );
  const maxBudgetTenths = Math.round(maxBudget * 10);
  const remainingBudget = Number(
    ((maxBudgetTenths - totalSpentTenths) / 10).toFixed(1)
  );

  return {
    players,
    remainingBudget,
  };
}

export interface SerializableLineupPlayerInput {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  club: ClubInfo;
  positionOrder: number; // 1-11 starting XI, 12-15 bench
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface SerializablePlayerPerformanceInput {
  minutes: number;
  goalsScored?: number;
  assists?: number;
  cleanSheets?: number;
  goalsConceded?: number;
  saves?: number;
  penaltiesSaved?: number;
  penaltiesMissed?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
  bonusPoints?: number;
  totalPoints?: number;
  fixture?: PlayerMatchFixtureSummary | null;
}

export interface SerializedGameweekPointsResult {
  totalPoints: number;
  captainPromotedToVice: boolean;
  substitutions: AutoSubstitutionRecord[];
  players: GameweekPointsPlayer[];
}

/**
 * Pure serializer for `/api/points` and Gameweek pitch rendering.
 * Evaluates auto-substitutions, Captain / Triple Captain / Vice-Captain promotion,
 * individual match stats, and itemized point breakdowns for all 15 squad members.
 */
export function serializeGameweekPointsLineup(
  lineupPlayers: SerializableLineupPlayerInput[],
  performancesByPlayerId: ReadonlyMap<string, SerializablePlayerPerformanceInput>,
  chipPlayed?: ChipType | null
): SerializedGameweekPointsResult {
  const playerMetaById = new Map<string, SerializableLineupPlayerInput>(
    lineupPlayers.map((p) => [p.playerId, p])
  );

  const statsByPlayerId = new Map<
    string,
    {
      minutes: number;
      totalPoints: number;
      detail: PlayerMatchStatsDetail;
      breakdown: MatchPointBreakdownItem[];
      fixture: PlayerMatchFixtureSummary | null;
    }
  >();

  for (const member of lineupPlayers) {
    const rawPerf = performancesByPlayerId.get(member.playerId);
    const minutes = Math.max(0, Math.trunc(rawPerf?.minutes ?? 0));
    const goalsScored = Math.max(0, Math.trunc(rawPerf?.goalsScored ?? 0));
    const assists = Math.max(0, Math.trunc(rawPerf?.assists ?? 0));
    const goalsConceded = Math.max(0, Math.trunc(rawPerf?.goalsConceded ?? 0));
    const cleanSheets =
      rawPerf?.cleanSheets !== undefined
        ? Math.max(0, Math.trunc(rawPerf.cleanSheets))
        : minutes >= 60 && goalsConceded === 0
          ? 1
          : 0;
    const saves = Math.max(0, Math.trunc(rawPerf?.saves ?? 0));
    const penaltiesSaved = Math.max(0, Math.trunc(rawPerf?.penaltiesSaved ?? 0));
    const penaltiesMissed = Math.max(
      0,
      Math.trunc(rawPerf?.penaltiesMissed ?? 0)
    );
    const yellowCards = Math.max(0, Math.trunc(rawPerf?.yellowCards ?? 0));
    const redCards = Math.max(0, Math.trunc(rawPerf?.redCards ?? 0));
    const ownGoals = Math.max(0, Math.trunc(rawPerf?.ownGoals ?? 0));
    const bonusPoints = Math.trunc(rawPerf?.bonusPoints ?? 0);

    const statInput: PlayerMatchStatInput = {
      position: member.position,
      minutes,
      goalsScored,
      assists,
      cleanSheets,
      goalsConceded,
      saves,
      penaltiesSaved,
      penaltiesMissed,
      yellowCards,
      redCards,
      ownGoals,
      bonusPoints,
    };

    const computedPoints =
      rawPerf?.totalPoints !== undefined
        ? rawPerf.totalPoints
        : calculatePlayerMatchPoints(statInput);

    const detail: PlayerMatchStatsDetail = {
      minutes,
      goalsScored,
      assists,
      cleanSheets,
      goalsConceded,
      saves,
      penaltiesSaved,
      penaltiesMissed,
      yellowCards,
      redCards,
      ownGoals,
      bonusPoints,
      totalPoints: computedPoints,
    };

    const breakdown = buildPlayerPointBreakdown(statInput);

    statsByPlayerId.set(member.playerId, {
      minutes,
      totalPoints: computedPoints,
      detail,
      breakdown,
      fixture: rawPerf?.fixture ?? null,
    });
  }

  const scoreResult = calculateSquadGameweekScore(
    lineupPlayers.map((p) => ({
      playerId: p.playerId,
      position: p.position,
      positionOrder: p.positionOrder,
      isCaptain: p.isCaptain,
      isViceCaptain: p.isViceCaptain,
    })),
    statsByPlayerId,
    chipPlayed ?? null
  );

  const players: GameweekPointsPlayer[] = scoreResult.players.map((evalPlayer) => {
    const meta = playerMetaById.get(evalPlayer.playerId)!;
    const statEntry = statsByPlayerId.get(evalPlayer.playerId)!;
    const partnerMeta = evalPlayer.subbedPartnerPlayerId
      ? playerMetaById.get(evalPlayer.subbedPartnerPlayerId)
      : undefined;

    return {
      playerId: evalPlayer.playerId,
      firstName: meta.firstName,
      lastName: meta.lastName,
      position: meta.position,
      club: meta.club,
      positionOrder: evalPlayer.positionOrder,
      originalPositionOrder: evalPlayer.originalPositionOrder,
      isCaptain: evalPlayer.isCaptain,
      isViceCaptain: evalPlayer.isViceCaptain,
      vicePromoted: evalPlayer.vicePromoted,
      multiplier: evalPlayer.multiplier,
      basePoints: evalPlayer.basePoints,
      points: evalPlayer.points,
      minutes: evalPlayer.minutes,
      subbedIn: evalPlayer.subbedIn,
      subbedOut: evalPlayer.subbedOut,
      subReason: evalPlayer.subReason,
      subbedPartnerPlayerId: evalPlayer.subbedPartnerPlayerId,
      subbedPartnerName: partnerMeta
        ? `${partnerMeta.firstName} ${partnerMeta.lastName}`.trim()
        : null,
      stats: statEntry.detail,
      breakdown: statEntry.breakdown,
      fixture: statEntry.fixture,
    };
  });

  return {
    totalPoints: scoreResult.totalPoints,
    captainPromotedToVice: scoreResult.captainPromotedToVice,
    substitutions: scoreResult.substitutions,
    players,
  };
}

