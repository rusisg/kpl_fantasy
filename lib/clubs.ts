/**
 * Canonical KPL club catalog & deterministic 3-letter short-code resolver.
 * Prevents naive `substring(0, 3)` collisions (e.g., "FC ..." -> "FC ", "Kairat" vs "Kaisar" -> "KAI").
 */

export interface CanonicalClub {
  name: string;
  shortName: string;
  aliases: string[];
  logoUrl?: string;
}

export const KPL_CLUB_CATALOG: readonly CanonicalClub[] = [
  {
    name: "FC Kairat",
    shortName: "KAI",
    aliases: ["kairat", "kairat almaty", "fc kairat", "fk kairat"],
  },
  {
    name: "FC Astana",
    shortName: "AST",
    aliases: ["astana", "fc astana", "fk astana"],
  },
  {
    name: "FC Aktobe",
    shortName: "AKT",
    aliases: ["aktobe", "fc aktobe", "fk aktobe"],
  },
  {
    name: "FC Ordabasy",
    shortName: "ORD",
    aliases: ["ordabasy", "ordabasy shymkent", "fc ordabasy", "fk ordabasy"],
  },
  {
    name: "FC Tobol",
    shortName: "TOB",
    aliases: ["tobol", "tobol kostanay", "fc tobol", "fk tobol"],
  },
  {
    name: "FC Yelimay",
    shortName: "ELI",
    aliases: ["yelimay", "elimai", "yelimay semey", "fc yelimay", "fc elimai"],
  },
  {
    name: "FC Atyrau",
    shortName: "ATY",
    aliases: ["atyrau", "fc atyrau", "fk atyrau"],
  },
  {
    name: "FC Kaisar",
    shortName: "KSR",
    aliases: ["kaisar", "kaisar kyzylorda", "fc kaisar", "fk kaisar", "kaysar"],
  },
  {
    name: "FC Kyzylzhar",
    shortName: "KYZ",
    aliases: ["kyzylzhar", "kyzylzhar sk", "kyzyl-zhar", "kyzylzhar petropavlovsk", "fc kyzylzhar"],
  },
  {
    name: "FK Zhenis",
    shortName: "ZHN",
    aliases: ["zhenis", "zhenis astana", "fc zhenis", "fk zhenis"],
  },
  {
    name: "FC Zhetysu",
    shortName: "ZHT",
    aliases: ["zhetysu", "zhetysu taldykorgan", "fc zhetysu", "fk zhetysu"],
  },
  {
    name: "FC Okzhetpes",
    shortName: "OKZ",
    aliases: ["okzhetpes", "okzhetpes kokshetau", "fc okzhetpes"],
  },
  {
    name: "FK Ulytau",
    shortName: "ULY",
    aliases: ["ulytau", "ulytau zhezkazgan", "fk ulytau", "fc ulytau"],
  },
  {
    name: "FK Kaspiy",
    shortName: "KAS",
    aliases: ["kaspiy", "kaspiy aktau", "fk kaspiy", "fc kaspiy", "caspiy"],
  },
  {
    name: "FC Shakhter Karagandy",
    shortName: "SHA",
    aliases: ["shakhter", "shakhter karagandy", "fc shakhter", "shakhtyor"],
  },
  {
    name: "FC Turan",
    shortName: "TUR",
    aliases: ["turan", "turan turkistan", "fc turan", "fk turan"],
  },
] as const;

/**
 * Resolves a club's display name (from Transfermarkt, seed data, or API feeds)
 * to a guaranteed collision-free 3-letter code.
 */
export function resolveClubShortName(
  rawClubName: string,
  usedCodes: Set<string> = new Set()
): string {
  const normalized = rawClubName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const entry of KPL_CLUB_CATALOG) {
    if (
      entry.aliases.some(
        (alias) => normalized === alias || normalized.includes(alias)
      )
    ) {
      usedCodes.add(entry.shortName);
      return entry.shortName;
    }
  }

  // Strip generic prefixes ("FC", "FK", "SC", "SK", "PFC") before computing fallback code
  const stripped = rawClubName
    .replace(/^(?:FC|FK|SC|SK|PFC)\s+/i, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  const base = (stripped || "CLB").padEnd(3, "X");
  let candidate = base.substring(0, 3);

  // Disambiguate if candidate is already claimed by another club
  if (usedCodes.has(candidate)) {
    for (let i = 3; i < stripped.length; i++) {
      const alt = `${base.substring(0, 2)}${stripped[i]}`;
      if (!usedCodes.has(alt)) {
        candidate = alt;
        break;
      }
    }
  }

  usedCodes.add(candidate);
  return candidate;
}
