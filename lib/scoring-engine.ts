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

export interface SquadGameweekScoreResult {
  totalPoints: number;
  captainPromotedToVice: boolean;
  players: EvaluatedSquadSnapshotPlayer[];
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
 * Evaluates a 15-player squad for a Gameweek, applying Captain (`2x`, or `3x` on TRIPLE_CAPTAIN)
 * and Vice-Captain failover (`2x`/`3x` if the Captain played 0 minutes).
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

  const captain = squadPlayers.find((p) => p.isCaptain);
  const viceCaptain = squadPlayers.find((p) => p.isViceCaptain);

  const captainMinutes = captain
    ? (statsByPlayerId.get(captain.playerId)?.minutes ?? 0)
    : 0;
  const viceMinutes = viceCaptain
    ? (statsByPlayerId.get(viceCaptain.playerId)?.minutes ?? 0)
    : 0;

  const captainPromotedToVice = captainMinutes === 0 && viceMinutes > 0;

  let totalPoints = 0;

  const evaluatedPlayers: EvaluatedSquadSnapshotPlayer[] = squadPlayers
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
    players: evaluatedPlayers,
  };
}
