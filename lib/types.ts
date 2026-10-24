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

export const ChipType = {
  WILDCARD: "WILDCARD",
  TRIPLE_CAPTAIN: "TRIPLE_CAPTAIN",
  BENCH_BOOST: "BENCH_BOOST",
  FREE_HIT: "FREE_HIT",
} as const;

export type ChipType = (typeof ChipType)[keyof typeof ChipType];

export interface ClubInfo {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string | null;
}

export interface PlayerMarketItem {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  price: number;
  totalPoints?: number;
  clubId: string;
  club: ClubInfo;
}

export interface SelectedSlotPlayer extends PlayerMarketItem {
  positionOrder: number; // 1-11 starting XI, 12-15 bench
  purchasePrice?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

export interface SquadPlayerRecord {
  id?: string;
  playerId: string;
  purchasePrice?: number | string;
  positionOrder: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    position: Position;
    price: number | string;
    totalPoints?: number;
    clubId: string;
    club: ClubInfo;
  };
}

export interface ActiveGameweekInfo {
  id: number;
  deadline: string;
  isCurrent: boolean;
  isFinished: boolean;
  isLocked: boolean;
}

export interface UserProfileInfo {
  id: string;
  name: string | null;
  email: string;
  favoriteClubId: string | null;
  favoriteClub: ClubInfo | null;
}

export interface SquadApiResponse {
  id: string;
  userId: string;
  name: string;
  budget: number | string;
  totalPoints: number;
  players: SquadPlayerRecord[];
}

export interface LeagueStandingRow {
  rank: number;
  memberId: string;
  squadId: string;
  userId: string | null;
  teamName: string;
  managerName: string;
  gameweekPoints: number;
  totalPoints: number;
  isCurrentUser: boolean;
}

export interface LeagueSummary {
  id: string;
  name: string;
  code: string;
  isPrivate: boolean;
  createdById: string;
  createdAt: string;
  memberCount: number;
  userRank: number | null;
  standings: LeagueStandingRow[];
}
