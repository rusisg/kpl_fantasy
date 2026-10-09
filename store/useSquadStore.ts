import { create } from "zustand";
import { Position } from "@prisma/client";
import { SQUAD_LIMITS } from "../lib/squad-validation";

export interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
}

export interface PlayerMarketItem {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
  clubId: string;
  club: ClubInfo;
}

export interface SelectedSlotPlayer extends PlayerMarketItem {
  positionOrder: number; // 1-11 starting XI, 12-15 bench
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

interface SquadState {
  squadName: string;
  selectedPlayers: SelectedSlotPlayer[];
  captainId: string | null;
  viceCaptainId: string | null;

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
  addPlayer: (player: PlayerMarketItem, targetOrder?: number) => boolean;
  removePlayer: (playerId: string) => void;
  swapPlayers: (orderA: number, orderB: number) => void;
  setCaptain: (playerId: string) => void;
  setViceCaptain: (playerId: string) => void;
  setFilters: (filters: { position?: Position | "ALL"; clubId?: string | "ALL"; search?: string }) => void;
  resetSquad: () => void;
  loadSquadFromApi: (squadData: { name: string; squadPlayers: any[] }) => void;
}

export const useSquadStore = create<SquadState>((set, get) => ({
  squadName: "My KPL XI",
  selectedPlayers: [],
  captainId: null,
  viceCaptainId: null,

  activePositionFilter: "ALL",
  activeClubFilter: "ALL",
  searchQuery: "",

  totalSpent: () => {
    return Number(
      get()
        .selectedPlayers.reduce((sum, p) => sum + Number(p.price), 0)
        .toFixed(1)
    );
  },

  remainingBudget: () => {
    return Number((SQUAD_LIMITS.MAX_BUDGET - get().totalSpent()).toFixed(1));
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

  addPlayer: (player, targetOrder) => {
    const state = get();
    const existing = state.selectedPlayers.find((p) => p.id === player.id);
    if (existing) return false;

    // Check budget limit
    if (state.remainingBudget() - player.price < 0) {
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

    // Find next available order slot (1-15) if not provided
    const usedOrders = new Set(state.selectedPlayers.map((p) => p.positionOrder));
    let assignedOrder = targetOrder;

    if (!assignedOrder || usedOrders.has(assignedOrder)) {
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
      positionOrder: assignedOrder,
    };

    const nextSelected = [...state.selectedPlayers, newPlayer];

    // Auto-assign captain if first starter
    let nextCaptain = state.captainId;
    let nextViceCaptain = state.viceCaptainId;

    if (assignedOrder <= 11 && !nextCaptain) {
      nextCaptain = player.id;
    } else if (assignedOrder <= 11 && !nextViceCaptain && player.id !== nextCaptain) {
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
    const playerA = state.selectedPlayers.find((p) => p.positionOrder === orderA);
    const playerB = state.selectedPlayers.find((p) => p.positionOrder === orderB);

    const nextSelected = state.selectedPlayers.map((p) => {
      if (p.positionOrder === orderA) return { ...p, positionOrder: orderB };
      if (p.positionOrder === orderB) return { ...p, positionOrder: orderA };
      return p;
    });

    set({ selectedPlayers: nextSelected });
  },

  setCaptain: (playerId) => {
    const state = get();
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
    const player = state.selectedPlayers.find((p) => p.id === playerId);
    if (!player || player.positionOrder > 11 || playerId === state.captainId) return;

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

    const loadedPlayers: SelectedSlotPlayer[] = squadData.squadPlayers.map((sp) => {
      if (sp.isCaptain) captainId = sp.player.id;
      if (sp.isViceCaptain) viceCaptainId = sp.player.id;

      return {
        id: sp.player.id,
        firstName: sp.player.firstName,
        lastName: sp.player.lastName,
        position: sp.player.position,
        price: Number(sp.player.price),
        clubId: sp.player.club.id,
        club: sp.player.club,
        positionOrder: sp.positionOrder,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
      };
    });

    set({
      squadName: squadData.name,
      selectedPlayers: loadedPlayers,
      captainId,
      viceCaptainId,
    });
  },
}));