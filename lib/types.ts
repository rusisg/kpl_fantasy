/**
 * Shared pure-TypeScript domain types safe for both Client Components and Server Runtime.
 * Zero imports from `@prisma/client` to prevent ORM bundle leakage into browser chunks.
 */

export const Position = {
  GK: "GK",
  DEF: "DEF",
  MID: "MID",
  FWD: "FWD",
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export const POSITIONS: readonly Position[] = [
  Position.GK,
  Position.DEF,
  Position.MID,
  Position.FWD,
] as const;

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

export interface SquadPlayerRecord {
  id?: string;
  playerId: string;
  positionOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    position: Position;
    price: number | string;
    clubId: string;
    club: ClubInfo;
  };
}

export interface SquadApiResponse {
  id: string;
  userId: string;
  name: string;
  budget: number | string;
  players: SquadPlayerRecord[];
}
