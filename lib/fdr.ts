import { KPL_CLUB_CATALOG, resolveClubShortName } from "./clubs";

export type FdrRating = 1 | 2 | 3 | 4 | 5;

/**
 * Baseline KPL club competitive strength ratings (on a 1.0–5.0 scale)
 * keyed by canonical 3-letter club shortName.
 */
export const KPL_CLUB_STRENGTH: Readonly<Record<string, number>> = {
  // Tier 5: Perennial title contenders & continental qualifiers
  KAI: 4.6,
  AST: 4.6,
  ORD: 4.4,
  AKT: 4.3,
  // Tier 4: Upper-table & cup contenders
  TOB: 3.9,
  ELI: 3.7,
  // Tier 3: Established mid-table clubs
  KSR: 3.1,
  ATY: 3.0,
  KYZ: 3.0,
  ZHN: 2.9,
  ZHT: 2.8,
  SHA: 2.9,
  // Tier 2: Newly promoted & lower-table sides
  OKZ: 2.3,
  OKO: 2.3,
  KAS: 2.3,
  CAS: 2.3,
  IRT: 2.3,
  TUR: 2.2,
  ULY: 2.1,
  ULT: 2.1,
  ALT: 2.1,
};

export type ClubShortNameLookup =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>;

/**
 * Resolves a club identifier (3-letter shortName, club name, or CUID) to its
 * baseline competitive strength rating (1.0–5.0).
 */
export function resolveClubStrength(
  clubIdentifier: string,
  clubShortNameMap?: ClubShortNameLookup
): number {
  const trimmed = clubIdentifier.trim();
  if (!trimmed) return 3.0;

  // 1. Direct lookup via provided CUID -> shortName map or record
  if (clubShortNameMap) {
    const mapped =
      clubShortNameMap instanceof Map
        ? clubShortNameMap.get(trimmed)
        : (clubShortNameMap as Readonly<Record<string, string>>)[trimmed];
    if (mapped) {
      const mappedShort = mapped.toUpperCase();
      if (mappedShort in KPL_CLUB_STRENGTH) {
        return KPL_CLUB_STRENGTH[mappedShort];
      }
    }
  }

  // 2. Direct 3-letter shortName match
  const upper = trimmed.toUpperCase();
  if (upper in KPL_CLUB_STRENGTH) {
    return KPL_CLUB_STRENGTH[upper];
  }

  // 3. Match against canonical catalog names & aliases
  const lower = trimmed.toLowerCase();
  for (const club of KPL_CLUB_CATALOG) {
    if (
      club.shortName === upper ||
      club.name.toLowerCase() === lower ||
      club.aliases.some((a) => lower === a || lower.includes(a))
    ) {
      return KPL_CLUB_STRENGTH[club.shortName] ?? 3.0;
    }
  }

  // 4. Fallback via resolveClubShortName if it resolves to a known code
  const resolved = resolveClubShortName(trimmed);
  if (resolved in KPL_CLUB_STRENGTH) {
    return KPL_CLUB_STRENGTH[resolved];
  }

  return 3.0;
}

/**
 * Pure utility to calculate relative Fixture Difficulty Rating (FDR) on a 1–5 integer scale.
 *
 * - 1: Very Easy (favorable home match against a lower-tier side)
 * - 2: Easy
 * - 3: Moderate (balanced matchup)
 * - 4: Hard (tough away fixture or top-4 opponent at home)
 * - 5: Very Hard (away trip to an elite title contender)
 */
export function calculateFixtureDifficulty(
  clubId: string,
  opponentClubId: string,
  isHome: boolean,
  clubShortNameMap?: ClubShortNameLookup
): FdrRating {
  const ownStrength = resolveClubStrength(clubId, clubShortNameMap);
  const opponentStrength = resolveClubStrength(opponentClubId, clubShortNameMap);

  // Opponent strength drives ~75% of difficulty; relative strength gap drives ~25%
  const relativeGap = (opponentStrength - ownStrength) * 0.35;
  // Playing away adds +0.45 difficulty; playing at home subtracts -0.45 difficulty
  const venueModifier = isHome ? -0.45 : 0.45;

  const rawScore = opponentStrength + relativeGap + venueModifier;
  const clamped = Math.max(1, Math.min(5, Math.round(rawScore)));
  return clamped as FdrRating;
}

/**
 * Formats a concise opponent tag with venue indicator, e.g. `AST (H)` or `KAI (A)`.
 * Supports localized home/away abbreviations (`H`/`A`, `Д`/`Г`, `Ү`/`Қ`).
 */
export function formatFixtureOpponentTag(
  opponentShortName: string,
  isHome: boolean,
  venueLabels: { home: string; away: string } = { home: "H", away: "A" }
): string {
  const code = opponentShortName.trim().toUpperCase() || "KPL";
  const venue = isHome ? venueLabels.home : venueLabels.away;
  return `${code} (${venue})`;
}

/**
 * Returns semantic Tailwind classes for rendering an FDR 1–5 difficulty pill
 * that maintains high contrast in both dark and light broadcast themes.
 */
export function getFdrBadgeClasses(fdr: FdrRating | number): string {
  switch (fdr) {
    case 1:
      return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40";
    case 2:
      return "bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/35";
    case 3:
      return "bg-surface-3 text-ink border-line-strong";
    case 4:
      return "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40";
    case 5:
      return "bg-rose-500/25 text-rose-700 dark:text-rose-300 border-rose-500/45";
    default:
      return "bg-surface-3 text-ink border-line";
  }
}
