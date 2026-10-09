import { Position } from "@prisma/client";
import { prisma } from "./prisma";

export async function generateAutopickSquad(
  favoriteClubId: string | null,
  strategy: "BALANCED" | "PREMIUM_ATTACK",
  maximizeFavorite: boolean
) {
  // Fetch all players sorted by price descending
  const allPlayers = await prisma.player.findMany({
    orderBy: { price: "desc" },
  });

  const selectedPlayers = new Map<string, any>();
  let remainingBudget = 100.0;

  const quotas = {
    [Position.GK]: 2,
    [Position.DEF]: 5,
    [Position.MID]: 5,
    [Position.FWD]: 3,
  };

  const currentCounts = {
    [Position.GK]: 0,
    [Position.DEF]: 0,
    [Position.MID]: 0,
    [Position.FWD]: 0,
  };

  const clubCounts: Record<string, number> = {};

  const addPlayer = (player: any) => {
    if (selectedPlayers.has(player.id)) return false;
    if (remainingBudget - Number(player.price) < 0) return false;
    if (currentCounts[player.position] >= quotas[player.position]) return false;
    if ((clubCounts[player.clubId] || 0) >= 3) return false;

    selectedPlayers.set(player.id, player);
    remainingBudget -= Number(player.price);
    currentCounts[player.position]++;
    clubCounts[player.clubId] = (clubCounts[player.clubId] || 0) + 1;
    return true;
  };

  // Phase 1: Bias towards favorite club if requested (Pick up to 3)
  if (maximizeFavorite && favoriteClubId) {
    const favoritePlayers = allPlayers.filter(p => p.clubId === favoriteClubId);
    for (const player of favoritePlayers) {
      if ((clubCounts[favoriteClubId] || 0) < 3) {
        addPlayer(player);
      }
    }
  }

  // Phase 2: Premium Attack Strategy (Force top MIDs and FWDs first)
  if (strategy === "PREMIUM_ATTACK") {
    const premiumAttackers = allPlayers.filter(
      p => p.position === Position.FWD || p.position === Position.MID
    );
    for (const player of premiumAttackers) {
      if (currentCounts[Position.FWD] < 2 || currentCounts[Position.MID] < 2) {
        addPlayer(player);
      }
    }
  }

  // Phase 3: Fill Remaining Quotas (Balanced filler)
  for (const player of allPlayers) {
    addPlayer(player);
  }

  // Fallback: If strict budget algorithm failed to find exactly 15, we would run a back-tracking pass here.
  // For production, a more advanced linear programming solver would guarantee the 100M knapsack exact match.

  let positionOrder = 1;
  const formattedSquad = Array.from(selectedPlayers.values()).map(p => ({
    playerId: p.id,
    positionOrder: positionOrder++,
    isCaptain: positionOrder === 2, // Arbitrarily set first player added as captain
    isViceCaptain: positionOrder === 3,
  }));

  return formattedSquad;
}