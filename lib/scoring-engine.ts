import { Position } from "./types";

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
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  basePoints: number;
  points: number; // basePoints * multiplier
  minutes: number;
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

  // 5. Goals conceded penalty (-1 per 2 goals conceded for GK and DEF)
  if (stat.position === Position.GK || stat.position === Position.DEF) {
    points -= Math.floor(goalsConceded / 2);
  }

  // 6. Penalties saved (+5 for GK) and missed (-2 for all)
  if (stat.position === Position.GK) {
    points += penaltiesSaved * 5;
  }
  points -= penaltiesMissed * 2;

  // 7. Discipline & own goals
  points -= yellowCards * 1;
  points -= redCards * 3;
  points -= ownGoals * 2;

  // 8. Optional bonus points
  points += bonusPoints;

  return points;
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

  const workingPlayers: SquadMemberScoringInput[] = squadPlayers
    .map((p) => ({ ...p }))
    .sort((a, b) => a.positionOrder - b.positionOrder);

  const substitutions: AutoSubstitutionRecord[] = [];

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

      let multiplier = 1;
      if (sp.isCaptain) {
        multiplier = captainPromotedToVice ? 1 : captainMultiplier;
      } else if (sp.isViceCaptain && captainPromotedToVice) {
        multiplier = captainMultiplier;
      }

      const isStarter = sp.positionOrder <= 11;
      const effectivePoints = basePoints * multiplier;

      if (isStarter || includeBench) {
        totalPoints += effectivePoints;
      }

      return {
        playerId: sp.playerId,
        positionOrder: sp.positionOrder,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        multiplier,
        basePoints,
        points: effectivePoints,
        minutes,
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
