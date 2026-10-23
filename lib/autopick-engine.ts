import { prisma } from "./prisma";
import { Position } from "./types";
import {
  SQUAD_LIMITS,
  validateFullSquad,
  validateStartingLineup,
  validateCaptaincy,
} from "./squad-validation";

export interface AutopickCandidate {
  id: string;
  clubId: string;
  position: Position;
  price: number | string | { toNumber?: () => number };
}

export interface AutopickResultItem {
  playerId: string;
  positionOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  price: number;
  position: Position;
  clubId: string;
}

interface NormalizedCandidate {
  id: string;
  clubId: string;
  position: Position;
  priceTenths: number;
  price: number;
}

const POSITIONS_ORDER: readonly Position[] = [
  Position.GK,
  Position.DEF,
  Position.MID,
  Position.FWD,
] as const;

const QUOTAS: Record<Position, number> = {
  [Position.GK]: SQUAD_LIMITS.POSITION_COUNTS[Position.GK],
  [Position.DEF]: SQUAD_LIMITS.POSITION_COUNTS[Position.DEF],
  [Position.MID]: SQUAD_LIMITS.POSITION_COUNTS[Position.MID],
  [Position.FWD]: SQUAD_LIMITS.POSITION_COUNTS[Position.FWD],
};

function toPriceTenths(raw: AutopickCandidate["price"]): number {
  if (typeof raw === "number") return Math.round(raw * 10);
  if (typeof raw === "string") return Math.round(Number(raw) * 10);
  if (raw && typeof raw.toNumber === "function") {
    return Math.round(raw.toNumber() * 10);
  }
  return Math.round(Number(raw) * 10);
}

/**
 * Computes the minimum possible cost (in tenths) to fill all still-open positional quotas
 * given the current selected set and per-club counts. Returns `Infinity` if any quota cannot be satisfied.
 */
function minRemainingCompletionTenths(
  cheapestPool: NormalizedCandidate[],
  selectedIds: Set<string>,
  currentCounts: Record<Position, number>,
  clubCounts: Record<string, number>
): number {
  const simClubCounts: Record<string, number> = { ...clubCounts };
  const simCounts: Record<Position, number> = { ...currentCounts };
  let neededTotal = 0;

  for (const pos of POSITIONS_ORDER) {
    neededTotal += QUOTAS[pos] - simCounts[pos];
  }
  if (neededTotal === 0) return 0;

  let minCostTenths = 0;

  for (const pos of POSITIONS_ORDER) {
    const needed = QUOTAS[pos] - simCounts[pos];
    if (needed <= 0) continue;

    let filled = 0;
    for (const candidate of cheapestPool) {
      if (candidate.position !== pos) continue;
      if (selectedIds.has(candidate.id)) continue;
      const cCount = simClubCounts[candidate.clubId] || 0;
      if (cCount >= SQUAD_LIMITS.MAX_PLAYERS_PER_CLUB) continue;

      simClubCounts[candidate.clubId] = cCount + 1;
      minCostTenths += candidate.priceTenths;
      filled++;
      if (filled === needed) break;
    }

    if (filled < needed) {
      return Number.POSITIVE_INFINITY;
    }
  }

  return minCostTenths;
}

/**
 * Pure, deterministic constrained squad builder.
 * Guarantees 15 players (2 GK, 5 DEF, 5 MID, 3 FWD), max 3 per club, total price <= 100.0M,
 * and a valid 4-4-2 starting XI (orders 1-11) + 4 bench slots (orders 12-15).
 */
export function solveAutopickSquad(
  rawCandidates: AutopickCandidate[],
  favoriteClubId: string | null,
  strategy: "BALANCED" | "PREMIUM_ATTACK" = "BALANCED",
  maximizeFavorite: boolean = false
): AutopickResultItem[] {
  const normalized: NormalizedCandidate[] = rawCandidates.map((p) => {
    const priceTenths = toPriceTenths(p.price);
    return {
      id: p.id,
      clubId: p.clubId,
      position: p.position as Position,
      priceTenths,
      price: Number((priceTenths / 10).toFixed(1)),
    };
  });

  // Desc by price (tie-break by id for determinism)
  const descPool = [...normalized].sort(
    (a, b) => b.priceTenths - a.priceTenths || a.id.localeCompare(b.id)
  );
  // Asc by price for minimum-completion lookahead
  const ascPool = [...normalized].sort(
    (a, b) => a.priceTenths - b.priceTenths || a.id.localeCompare(b.id)
  );

  const selectedPlayers = new Map<string, NormalizedCandidate>();
  const selectedIds = new Set<string>();
  let remainingTenths = Math.round(SQUAD_LIMITS.MAX_BUDGET * 10); // 1000

  const currentCounts: Record<Position, number> = {
    [Position.GK]: 0,
    [Position.DEF]: 0,
    [Position.MID]: 0,
    [Position.FWD]: 0,
  };

  const clubCounts: Record<string, number> = {};

  const tryAddPlayer = (player: NormalizedCandidate): boolean => {
    if (selectedIds.has(player.id)) return false;
    if (currentCounts[player.position] >= QUOTAS[player.position]) return false;
    if ((clubCounts[player.clubId] || 0) >= SQUAD_LIMITS.MAX_PLAYERS_PER_CLUB) {
      return false;
    }
    if (remainingTenths - player.priceTenths < 0) return false;

    // Lookahead feasibility check: reserve enough budget for remaining open slots
    selectedIds.add(player.id);
    currentCounts[player.position]++;
    clubCounts[player.clubId] = (clubCounts[player.clubId] || 0) + 1;

    const minFutureCost = minRemainingCompletionTenths(
      ascPool,
      selectedIds,
      currentCounts,
      clubCounts
    );

    if (remainingTenths - player.priceTenths < minFutureCost) {
      // Roll back pick — taking this player would starve remaining slots
      selectedIds.delete(player.id);
      currentCounts[player.position]--;
      clubCounts[player.clubId]--;
      return false;
    }

    selectedPlayers.set(player.id, player);
    remainingTenths -= player.priceTenths;
    return true;
  };

  // Phase 1: Bias towards favorite club if requested (up to 3 players)
  if (maximizeFavorite && favoriteClubId) {
    const favoritePlayers = descPool.filter((p) => p.clubId === favoriteClubId);
    for (const player of favoritePlayers) {
      if ((clubCounts[favoriteClubId] || 0) < SQUAD_LIMITS.MAX_PLAYERS_PER_CLUB) {
        tryAddPlayer(player);
      }
    }
  }

  // Phase 2: Strategy-specific core selection
  if (strategy === "PREMIUM_ATTACK") {
    // Lock in up to 2 marquee FWDs and 2 marquee MIDs first
    for (const player of descPool) {
      if (player.position === Position.FWD && currentCounts[Position.FWD] < 2) {
        tryAddPlayer(player);
      } else if (
        player.position === Position.MID &&
        currentCounts[Position.MID] < 2
      ) {
        tryAddPlayer(player);
      }
      if (currentCounts[Position.FWD] >= 2 && currentCounts[Position.MID] >= 2) {
        break;
      }
    }
  } else {
    // BALANCED: Round-robin across positions so budget is shared evenly across GK/DEF/MID/FWD
    const byPos: Record<Position, NormalizedCandidate[]> = {
      [Position.GK]: descPool.filter((p) => p.position === Position.GK),
      [Position.DEF]: descPool.filter((p) => p.position === Position.DEF),
      [Position.MID]: descPool.filter((p) => p.position === Position.MID),
      [Position.FWD]: descPool.filter((p) => p.position === Position.FWD),
    };
    const cursors: Record<Position, number> = {
      [Position.GK]: Math.min(1, Math.max(0, Math.floor(byPos[Position.GK].length * 0.25))),
      [Position.DEF]: Math.min(2, Math.max(0, Math.floor(byPos[Position.DEF].length * 0.2))),
      [Position.MID]: Math.min(2, Math.max(0, Math.floor(byPos[Position.MID].length * 0.2))),
      [Position.FWD]: Math.min(1, Math.max(0, Math.floor(byPos[Position.FWD].length * 0.2))),
    };

    let progress = true;
    while (selectedPlayers.size < SQUAD_LIMITS.TOTAL_PLAYERS && progress) {
      progress = false;
      for (const pos of POSITIONS_ORDER) {
        if (currentCounts[pos] >= QUOTAS[pos]) continue;
        const list = byPos[pos];
        while (cursors[pos] < list.length) {
          const candidate = list[cursors[pos]++];
          if (tryAddPlayer(candidate)) {
            progress = true;
            break;
          }
        }
      }
    }
  }

  // Phase 3: Fill any remaining open quotas (descPool then ascPool fallback)
  for (const player of descPool) {
    if (selectedPlayers.size >= SQUAD_LIMITS.TOTAL_PLAYERS) break;
    tryAddPlayer(player);
  }
  for (const player of ascPool) {
    if (selectedPlayers.size >= SQUAD_LIMITS.TOTAL_PLAYERS) break;
    tryAddPlayer(player);
  }

  // Phase 4: Arrange into a valid 4-4-2 starting XI (orders 1-11) and 4 bench slots (orders 12-15)
  const picked = Array.from(selectedPlayers.values());
  const gks = picked
    .filter((p) => p.position === Position.GK)
    .sort((a, b) => b.priceTenths - a.priceTenths);
  const defs = picked
    .filter((p) => p.position === Position.DEF)
    .sort((a, b) => b.priceTenths - a.priceTenths);
  const mids = picked
    .filter((p) => p.position === Position.MID)
    .sort((a, b) => b.priceTenths - a.priceTenths);
  const fwds = picked
    .filter((p) => p.position === Position.FWD)
    .sort((a, b) => b.priceTenths - a.priceTenths);

  const startingXI: NormalizedCandidate[] = [
    ...gks.slice(0, 1),
    ...defs.slice(0, 4),
    ...mids.slice(0, 4),
    ...fwds.slice(0, 2),
  ];

  const bench: NormalizedCandidate[] = [
    ...gks.slice(1, 2),
    ...defs.slice(4, 5),
    ...mids.slice(4, 5),
    ...fwds.slice(2, 3),
  ];

  // Pick Captain & Vice-Captain as the two highest-priced starters
  const rankedStarters = [...startingXI].sort(
    (a, b) => b.priceTenths - a.priceTenths || a.id.localeCompare(b.id)
  );
  const captainId = rankedStarters[0]?.id ?? "";
  const viceCaptainId = rankedStarters[1]?.id ?? "";

  const orderedSquad = [...startingXI, ...bench].map((p, index) => ({
    playerId: p.id,
    positionOrder: index + 1,
    isCaptain: p.id === captainId,
    isViceCaptain: p.id === viceCaptainId,
    price: p.price,
    position: p.position,
    clubId: p.clubId,
  }));

  // Post-condition verification against core validator
  const fullCheck = validateFullSquad(
    orderedSquad.map((p) => ({
      id: p.playerId,
      position: p.position,
      price: p.price,
      clubId: p.clubId,
    }))
  );
  const xiCheck = validateStartingLineup(
    orderedSquad
      .filter((p) => p.positionOrder <= 11)
      .map((p) => ({
        id: p.playerId,
        position: p.position,
        price: p.price,
        clubId: p.clubId,
      }))
  );
  const capCheck = validateCaptaincy(
    orderedSquad
      .filter((p) => p.positionOrder <= 11)
      .map((p) => ({
        id: p.playerId,
        position: p.position,
        price: p.price,
        clubId: p.clubId,
        positionOrder: p.positionOrder,
        isCaptain: p.isCaptain,
        isViceCaptain: p.isViceCaptain,
      })),
    captainId,
    viceCaptainId
  );

  if (!fullCheck.isValid || !xiCheck.isValid || !capCheck.isValid) {
    const combinedErrors = [
      ...fullCheck.errors,
      ...xiCheck.errors,
      ...capCheck.errors,
    ]
      .map((e) => e.message)
      .join(" | ");
    throw new Error(`Autopick engine failed validation: ${combinedErrors}`);
  }

  return orderedSquad;
}

export async function generateAutopickSquad(
  favoriteClubId: string | null,
  strategy: "BALANCED" | "PREMIUM_ATTACK",
  maximizeFavorite: boolean
) {
  const allPlayers = await prisma.player.findMany({
    orderBy: [{ price: "desc" }, { id: "asc" }],
  });

  const Candidates: AutopickCandidate[] = allPlayers.map((p) => ({
    id: p.id,
    clubId: p.clubId,
    position: p.position as Position,
    price: Number(p.price),
  }));

  return solveAutopickSquad(
    Candidates,
    favoriteClubId,
    strategy,
    maximizeFavorite
  );
}
