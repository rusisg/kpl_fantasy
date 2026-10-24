import { create } from "zustand";
import {
  Position,
  ClubInfo,
  PlayerMarketItem,
  SelectedSlotPlayer,
  SquadPlayerRecord,
  ActiveGameweekInfo,
  UserProfileInfo,
} from "../lib/types";
import { SQUAD_LIMITS } from "../lib/squad-validation";

export type { ClubInfo, PlayerMarketItem, SelectedSlotPlayer };

/**
 * Default tactical slot allocation (4-4-2 starting XI + 1 GK, 1 DEF, 1 MID, 1 FWD bench)
 * so adding 15 players in any order always forms a legal starting XI (1 GK, 4 DEF, 4 MID, 2 FWD).
 */
const POSITION_SLOTS: Record<Position, number[]> = {
  [Position.GK]: [1, 12],
  [Position.DEF]: [2, 3, 4, 5, 13],
  [Position.MID]: [6, 7, 8, 9, 14],
  [Position.FWD]: [10, 11, 15],
};

interface SquadState {
  squadId: string | null;
  squadName: string;
  squadTotalPoints: number;
  selectedPlayers: SelectedSlotPlayer[];
  captainId: string | null;
  viceCaptainId: string | null;
  userProfile: UserProfileInfo | null;
  activeGameweek: ActiveGameweekInfo | null;

  // Filter state for player picker
  activePositionFilter: Position | "ALL";
  activeClubFilter: string | "ALL";
  searchQuery: string;

  // Derived calculations
  totalSpent: () => number;
  remainingBudget: () => number;
  clubCounts: () => Record<string, number>;
  positionCounts: () => Record<Position, number>;

  // Actions
  setSquadName: (name: string) => void;
  setUserProfile: (profile: UserProfileInfo | null) => void;
  setActiveGameweek: (gw: ActiveGameweekInfo | null) => void;
  addPlayer: (player: PlayerMarketItem, targetOrder?: number) => boolean;
  removePlayer: (playerId: string) => void;
  swapPlayers: (orderA: number, orderB: number) => void;
  setCaptain: (playerId: string) => void;
  setViceCaptain: (playerId: string) => void;
  setFilters: (filters: {
    position?: Position | "ALL";
    clubId?: string | "ALL";
    search?: string;
  }) => void;
  resetSquad: () => void;
  loadSquadFromApi: (squadData: {
    id?: string;
    name: string;
    totalPoints?: number;
    players?: SquadPlayerRecord[];
    squadPlayers?: SquadPlayerRecord[];
  }) => void;
}

export const useSquadStore = create<SquadState>((set, get) => ({
  squadId: null,
  squadName: "",
  squadTotalPoints: 0,
  selectedPlayers: [],
  captainId: null,
  viceCaptainId: null,
  userProfile: null,
  activeGameweek: null,

  activePositionFilter: "ALL",
  activeClubFilter: "ALL",
  searchQuery: "",

  totalSpent: () => {
    const tenths = get().selectedPlayers.reduce(
      (sum, p) => sum + Math.round(Number(p.purchasePrice ?? p.price) * 10),
      0
    );
    return Number((tenths / 10).toFixed(1));
  },

  remainingBudget: () => {
    const maxTenths = Math.round(SQUAD_LIMITS.MAX_BUDGET * 10);
    const spentTenths = get().selectedPlayers.reduce(
      (sum, p) => sum + Math.round(Number(p.purchasePrice ?? p.price) * 10),
      0
    );
    return Number(((maxTenths - spentTenths) / 10).toFixed(1));
  },

  clubCounts: () => {
    const counts: Record<string, number> = {};
    get().selectedPlayers.forEach((p) => {
      counts[p.clubId] = (counts[p.clubId] || 0) + 1;
    });
    return counts;
  },

  positionCounts: () => {
    const counts: Record<Position, number> = {
      [Position.GK]: 0,
      [Position.DEF]: 0,
      [Position.MID]: 0,
      [Position.FWD]: 0,
    };
    get().selectedPlayers.forEach((p) => {
      counts[p.position] = (counts[p.position] || 0) + 1;
    });
    return counts;
  },

  setSquadName: (name) => set({ squadName: name }),
  setUserProfile: (userProfile) => set({ userProfile }),
  setActiveGameweek: (activeGameweek) => set({ activeGameweek }),

  addPlayer: (player, targetOrder) => {
    const state = get();
    if (state.activeGameweek?.isLocked) return false;

    const existing = state.selectedPlayers.find((p) => p.id === player.id);
    if (existing) return false;

    const playerPrice = Number(player.price);

    // Check budget limit (integer tenths)
    if (
      Math.round(state.remainingBudget() * 10) - Math.round(playerPrice * 10) <
      0
    ) {
      return false;
    }

    // Check max players per club
    const currentClubCount = state.clubCounts()[player.clubId] || 0;
    if (currentClubCount >= SQUAD_LIMITS.MAX_PLAYERS_PER_CLUB) {
      return false;
    }

    // Check position quota (max 2 GK, 5 DEF, 5 MID, 3 FWD)
    const currentPosCount = state.positionCounts()[player.position] || 0;
    const maxAllowedPos = SQUAD_LIMITS.POSITION_COUNTS[player.position];
    if (currentPosCount >= maxAllowedPos) {
      return false;
    }

    // Assign position-aware slot so starting XI (1-11) always maintains a legal 4-4-2 formation
    const usedOrders = new Set(state.selectedPlayers.map((p) => p.positionOrder));
    let assignedOrder = targetOrder;

    if (!assignedOrder || usedOrders.has(assignedOrder)) {
      const preferredSlots = POSITION_SLOTS[player.position];
      assignedOrder = preferredSlots.find((slot) => !usedOrders.has(slot));
    }

    if (!assignedOrder) {
      for (let order = 1; order <= 15; order++) {
        if (!usedOrders.has(order)) {
          assignedOrder = order;
          break;
        }
      }
    }

    if (!assignedOrder) return false;

    const newPlayer: SelectedSlotPlayer = {
      ...player,
      price: playerPrice,
      purchasePrice: playerPrice,
      positionOrder: assignedOrder,
    };

    const nextSelected = [...state.selectedPlayers, newPlayer];

    // Auto-assign captain if first starter
    let nextCaptain = state.captainId;
    let nextViceCaptain = state.viceCaptainId;

    if (assignedOrder <= 11 && !nextCaptain) {
      nextCaptain = player.id;
    } else if (
      assignedOrder <= 11 &&
      !nextViceCaptain &&
      player.id !== nextCaptain
    ) {
      nextViceCaptain = player.id;
    }

    set({
      selectedPlayers: nextSelected,
      captainId: nextCaptain,
      viceCaptainId: nextViceCaptain,
    });

    return true;
  },

  removePlayer: (playerId) => {
    const state = get();
    if (state.activeGameweek?.isLocked) return;

    const nextSelected = state.selectedPlayers.filter((p) => p.id !== playerId);

    let nextCaptain = state.captainId;
    let nextViceCaptain = state.viceCaptainId;

    if (nextCaptain === playerId) nextCaptain = null;
    if (nextViceCaptain === playerId) nextViceCaptain = null;

    set({
      selectedPlayers: nextSelected,
      captainId: nextCaptain,
      viceCaptainId: nextViceCaptain,
    });
  },

  swapPlayers: (orderA, orderB) => {
    const state = get();
    if (state.activeGameweek?.isLocked) return;

    const nextSelected = state.selectedPlayers.map((p) => {
      if (p.positionOrder === orderA) return { ...p, positionOrder: orderB };
      if (p.positionOrder === orderB) return { ...p, positionOrder: orderA };
      return p;
    });

    set({ selectedPlayers: nextSelected });
  },

  setCaptain: (playerId) => {
    const state = get();
    if (state.activeGameweek?.isLocked) return;

    const player = state.selectedPlayers.find((p) => p.id === playerId);
    if (!player || player.positionOrder > 11) return; // Captain must be in starting XI

    let nextVice = state.viceCaptainId;
    if (nextVice === playerId) {
      nextVice = state.captainId !== playerId ? state.captainId : null;
    }

    set({ captainId: playerId, viceCaptainId: nextVice });
  },

  setViceCaptain: (playerId) => {
    const state = get();
    if (state.activeGameweek?.isLocked) return;

    const player = state.selectedPlayers.find((p) => p.id === playerId);
    if (!player || player.positionOrder > 11 || playerId === state.captainId) {
      return;
    }

    set({ viceCaptainId: playerId });
  },

  setFilters: (filters) => {
    set((state) => ({
      activePositionFilter: filters.position ?? state.activePositionFilter,
      activeClubFilter: filters.clubId ?? state.activeClubFilter,
      searchQuery: filters.search ?? state.searchQuery,
    }));
  },

  resetSquad: () => {
    set({
      selectedPlayers: [],
      captainId: null,
      viceCaptainId: null,
    });
  },

  loadSquadFromApi: (squadData) => {
    let captainId: string | null = null;
    let viceCaptainId: string | null = null;

    const rawPlayers = squadData.players ?? squadData.squadPlayers ?? [];

    const loadedPlayers: SelectedSlotPlayer[] = rawPlayers.map((sp) => {
      if (sp.isCaptain) captainId = sp.player.id;
      if (sp.isViceCaptain) viceCaptainId = sp.player.id;

      const marketPrice = Number(sp.player.price);
      const rawPurchase = Number(sp.purchasePrice ?? 0);
      const purchasePrice = rawPurchase > 0 ? rawPurchase : marketPrice;

      return {
        id: sp.player.id,
        firstName: sp.player.firstName,
        lastName: sp.player.lastName,
        position: sp.player.position,
        price: marketPrice,
        purchasePrice,
        totalPoints: sp.player.totalPoints ?? 0,
        clubId: sp.player.club.id,
        club: sp.player.club,
        positionOrder: sp.positionOrder,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
      };
    });

    set({
      squadId: squadData.id ?? null,
      squadName: squadData.name,
      squadTotalPoints: squadData.totalPoints ?? 0,
      selectedPlayers: loadedPlayers,
      captainId,
      viceCaptainId,
    });
  },
}));
