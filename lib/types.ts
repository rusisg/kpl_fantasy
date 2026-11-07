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

export interface PlayerUpcomingFixture {
  fixtureId: string;
  gameweekId: number;
  kickoffTime: string;
  opponentClubId: string;
  opponentName: string;
  opponentShortName: string;
  opponentLogoUrl?: string | null;
  isHome: boolean;
  fdr: 1 | 2 | 3 | 4 | 5;
  tag: string; // e.g. "AST (H)" or "KAI (A)"
}

export interface PlayerSeasonStats {
  totalPoints: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  minutes: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonusPoints: number;
  appearances: number;
  form: number; // average points over the last 3 gameweeks
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
  selectedByPercent?: number;
  upcomingFixtures?: PlayerUpcomingFixture[];
  stats?: PlayerSeasonStats;
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
  freeTransfers?: number;
  wildcardUsed?: boolean;
  tripleCaptainUsed?: boolean;
  benchBoostUsed?: boolean;
  freeHitUsed?: boolean;
  activeChip?: ChipType | null;
  usedChips?: ChipType[];
  isUnlimitedTransfers?: boolean;
  transfersThisGw?: number;
  pointsHitThisGw?: number;
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
  slug?: string | null;
  name: string;
  code: string;
  isPrivate: boolean;
  isSystem?: boolean;
  clubId?: string | null;
  club?: ClubInfo | null;
  createdById: string | null;
  createdAt: string;
  memberCount: number;
  userRank: number | null;
  standings: LeagueStandingRow[];
}

export type FixtureStatus =
  | "SCHEDULED"
  | "LIVE"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED";

export interface FixtureItem {
  id: string;
  kickoffTime: string;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  homeClub: ClubInfo;
  awayClub: ClubInfo;
}

export interface FixturesApiData {
  gameweek: ActiveGameweekInfo;
  activeGameweekId: number | null;
  firstGameweekId: number;
  lastGameweekId: number;
  fixtures: FixtureItem[];
}

export type PointBreakdownCategory =
  | "MINUTES_60_PLUS"
  | "MINUTES_UNDER_60"
  | "MINUTES_DNP"
  | "GOALS"
  | "ASSISTS"
  | "CLEAN_SHEET"
  | "SAVES"
  | "PENALTIES_SAVED"
  | "PENALTIES_MISSED"
  | "GOALS_CONCEDED"
  | "YELLOW_CARDS"
  | "RED_CARDS"
  | "OWN_GOALS"
  | "BONUS";

export interface MatchPointBreakdownItem {
  category: PointBreakdownCategory;
  statValue: number;
  points: number;
}

export interface PlayerMatchFixtureSummary {
  fixtureId: string;
  homeClub: ClubInfo;
  awayClub: ClubInfo;
  homeScore: number | null;
  awayScore: number | null;
  isHome: boolean;
  status: FixtureStatus;
}

export interface PlayerMatchStatsDetail {
  minutes: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  bonusPoints: number;
  totalPoints: number;
}

export interface GameweekPointsPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: Position;
  club: ClubInfo;
  positionOrder: number; // 1-11 starting XI, 12-15 bench (post auto-sub)
  originalPositionOrder?: number; // 1-11 starting XI, 12-15 bench (pre auto-sub)
  isCaptain: boolean;
  isViceCaptain: boolean;
  vicePromoted?: boolean;
  multiplier: number;
  basePoints: number; // raw points before captain multiplier
  points: number; // effective points (basePoints * multiplier)
  minutes: number;
  subbedIn?: boolean;
  subbedOut?: boolean;
  subReason?: "AUTO_SUB_IN" | "AUTO_SUB_OUT_DNP" | null;
  subbedPartnerPlayerId?: string | null;
  subbedPartnerName?: string | null;
  stats?: PlayerMatchStatsDetail;
  breakdown?: MatchPointBreakdownItem[];
  fixture?: PlayerMatchFixtureSummary | null;
}

export interface GameweekHistoryRow {
  gameweekId: number;
  totalPoints: number;
  rank: number | null;
  chipPlayed: ChipType | null;
}

export interface PointsApiData {
  hasSquad: boolean;
  squadName: string | null;
  seasonTotalPoints: number;
  selectedGameweekId: number | null;
  activeGameweekId?: number | null;
  availableGameweekIds?: number[];
  history: GameweekHistoryRow[]; // every processed gameweek for this squad
  snapshot: {
    gameweekId: number;
    totalPoints: number;
    rank: number | null;
    chipPlayed: ChipType | null;
    gameweekAverage: number;
    gameweekHighest: number;
    isLive?: boolean;
    players: GameweekPointsPlayer[];
  } | null;
}
