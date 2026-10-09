import { Position } from "@prisma/client";

// ============================================
// CONSTANTS & CONSTRAINTS
// ============================================
export const SQUAD_LIMITS = {
  MAX_BUDGET: 100.0,
  TOTAL_PLAYERS: 15,
  STARTING_XI_COUNT: 11,
  BENCH_COUNT: 4,
  MAX_PLAYERS_PER_CLUB: 3,
  POSITION_COUNTS: {
    [Position.GK]: 2,
    [Position.DEF]: 5,
    [Position.MID]: 5,
    [Position.FWD]: 3,
  },
  FORMATION_MIN_MAX: {
    [Position.GK]: { min: 1, max: 1 },
    [Position.DEF]: { min: 3, max: 5 },
    [Position.MID]: { min: 2, max: 5 },
    [Position.FWD]: { min: 1, max: 3 },
  },
};

// ============================================
// TYPES & INTERFACES
// ============================================
export interface SquadPlayerInput {
  id: string; // Player ID
  position: Position;
  price: number | string; // e.g., 5.5 or "5.5"
  clubId: string;
}

export interface SelectedSquadPlayerInput extends SquadPlayerInput {
  positionOrder: number; // 1-11 starting XI, 12-15 bench
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export interface ValidationError {
  field?: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// ============================================
// CORE VALIDATION FUNCTIONS
// ============================================

/**
 * Validates a 15-player squad selection against FPL budget, club, and position allocation rules.
 */
export function validateFullSquad(players: SquadPlayerInput[]): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Total Player Count Check
  if (players.length !== SQUAD_LIMITS.TOTAL_PLAYERS) {
    errors.push({
      message: `Squad must contain exactly ${SQUAD_LIMITS.TOTAL_PLAYERS} players. Currently selected: ${players.length}.`,
    });
  }

  // 2. Budget Limit Check
  const totalPrice = players.reduce((sum, p) => sum + Number(p.price), 0);
  if (totalPrice > SQUAD_LIMITS.MAX_BUDGET) {
    errors.push({
      field: "budget",
      message: `Total squad value (${totalPrice.toFixed(1)}M) exceeds the maximum allowed budget of ${SQUAD_LIMITS.MAX_BUDGET}M.`,
    });
  }

  // 3. Position Allocation Check
  const positionCounts: Record<Position, number> = {
    [Position.GK]: 0,
    [Position.DEF]: 0,
    [Position.MID]: 0,
    [Position.FWD]: 0,
  };

  players.forEach((p) => {
    if (positionCounts[p.position] !== undefined) {
      positionCounts[p.position] += 1;
    }
  });

  for (const pos of Object.keys(SQUAD_LIMITS.POSITION_COUNTS) as Position[]) {
    const required = SQUAD_LIMITS.POSITION_COUNTS[pos];
    const actual = positionCounts[pos] || 0;
    if (actual !== required) {
      errors.push({
        field: "position",
        message: `Must select exactly ${required} ${pos}s. Currently selected: ${actual}.`,
      });
    }
  }

  // 4. Max Players Per Club Check
  const clubCounts: Record<string, number> = {};
  players.forEach((p) => {
    clubCounts[p.clubId] = (clubCounts[p.clubId] || 0) + 1;
  });

  for (const [clubId, count] of Object.entries(clubCounts)) {
    if (count > SQUAD_LIMITS.MAX_PLAYERS_PER_CLUB) {
      errors.push({
        field: "club",
        message: `Cannot select more than ${SQUAD_LIMITS.MAX_PLAYERS_PER_CLUB} players from the same club. Club ID ${clubId} has ${count} players.`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates starting XI tactical formation (must include 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD).
 */
export function validateStartingLineup(startingXI: SquadPlayerInput[]): ValidationResult {
  const errors: ValidationError[] = [];

  if (startingXI.length !== SQUAD_LIMITS.STARTING_XI_COUNT) {
    errors.push({
      message: `Starting XI must consist of exactly ${SQUAD_LIMITS.STARTING_XI_COUNT} players. Selected: ${startingXI.length}.`,
    });
  }

  const counts: Record<Position, number> = {
    [Position.GK]: 0,
    [Position.DEF]: 0,
    [Position.MID]: 0,
    [Position.FWD]: 0,
  };

  startingXI.forEach((p) => {
    if (counts[p.position] !== undefined) {
      counts[p.position] += 1;
    }
  });

  for (const pos of Object.keys(SQUAD_LIMITS.FORMATION_MIN_MAX) as Position[]) {
    const { min, max } = SQUAD_LIMITS.FORMATION_MIN_MAX[pos];
    const actual = counts[pos] || 0;

    if (actual < min || actual > max) {
      errors.push({
        field: "formation",
        message: `Invalid formation for ${pos}: must have between ${min} and ${max}. Currently selected: ${actual}.`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates captain and vice-captain assignments in the starting XI.
 */
export function validateCaptaincy(
  startingXI: SelectedSquadPlayerInput[],
  captainId: string,
  viceCaptainId: string
): ValidationResult {
  const errors: ValidationError[] = [];

  if (captainId === viceCaptainId) {
    errors.push({
      message: "Captain and Vice-Captain cannot be the same player.",
    });
  }

  const starterIds = new Set(startingXI.map((p) => p.id));

  if (!starterIds.has(captainId)) {
    errors.push({
      message: "Captain must be selected from the starting XI.",
    });
  }

  if (!starterIds.has(viceCaptainId)) {
    errors.push({
      message: "Vice-Captain must be selected from the starting XI.",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}