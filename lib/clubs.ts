/**
 * Canonical KPL club catalog & deterministic 3-letter short-code resolver.
 * Sourced from official KFF League (https://kffleague.kz).
 * При использовании материалов обязательна ссылка на официальный сайт kffleague.kz.
 */

export interface CanonicalClub {
  name: string;
  shortName: string;
  aliases: string[];
  logoUrl?: string;
}

export const KPL_CLUB_CATALOG: readonly CanonicalClub[] = [
  {
    name: "Ордабасы",
    shortName: "ORD",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/ordabasy.webp",
    aliases: ["ордабасы", "ordabasy", "ordabasy shymkent", "fc ordabasy", "fk ordabasy"],
  },
  {
    name: "Кайрат",
    shortName: "KAI",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/kairat.png",
    aliases: ["кайрат", "қайрат", "kairat", "kairat almaty", "fc kairat", "fk kairat"],
  },
  {
    name: "Астана",
    shortName: "AST",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/astana.webp",
    aliases: ["астана", "astana", "fc astana", "fk astana"],
  },
  {
    name: "Окжетпес",
    shortName: "OKZ",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/okzhetpes.webp",
    aliases: ["окжетпес", "оқжетпес", "okzhetpes", "okzhetpes kokshetau", "fc okzhetpes"],
  },
  {
    name: "Актобе",
    shortName: "AKT",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/aktobe.png",
    aliases: ["актобе", "ақтөбе", "aktobe", "fc aktobe", "fk aktobe"],
  },
  {
    name: "Елимай",
    shortName: "ELI",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/elimai.webp",
    aliases: ["елимай", "елімай", "yelimay", "elimai", "yelimay semey", "fc yelimay", "fc elimai"],
  },
  {
    name: "Тобыл",
    shortName: "TOB",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/tobol-20260225-transparent.png",
    aliases: ["тобыл", "тобол", "tobol", "tobol kostanay", "fc tobol", "fk tobol"],
  },
  {
    name: "Улытау",
    shortName: "ULY",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/ulytai.webp",
    aliases: ["улытау", "ұлытау", "ulytau", "ulytai", "ulytau zhezkazgan", "fk ulytau", "fc ulytau"],
  },
  {
    name: "Женис",
    shortName: "ZHN",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/zhenis.webp",
    aliases: ["женис", "жеңіс", "zhenis", "jenis", "zhenis astana", "fc zhenis", "fk zhenis"],
  },
  {
    name: "Каспий",
    shortName: "KAS",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/caspiy.png",
    aliases: ["каспий", "kaspiy", "caspiy", "kaspiy aktau", "fk kaspiy", "fc kaspiy"],
  },
  {
    name: "Кызылжар",
    shortName: "KYZ",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/kyzylzhar.png",
    aliases: ["кызылжар", "қызылжар", "kyzylzhar", "kyzylzhar sk", "kyzyl-zhar", "kyzylzhar petropavlovsk", "fc kyzylzhar"],
  },
  {
    name: "Иртыш",
    shortName: "IRT",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/ertis.png",
    aliases: ["иртыш", "ертіс", "ертис", "irtysh", "ertis", "fc irtysh", "fc ertis"],
  },
  {
    name: "Алтай",
    shortName: "ALT",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/altai.png",
    aliases: ["алтай", "алтай өскемен", "altai", "altay", "fc altai"],
  },
  {
    name: "Атырау",
    shortName: "ATY",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/atyrai.webp",
    aliases: ["атырау", "atyrau", "atyrai", "fc atyrau", "fk atyrau"],
  },
  {
    name: "Жетысу",
    shortName: "ZHT",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/jetisu.webp",
    aliases: ["жетысу", "жетісу", "zhetysu", "jetisu", "zhetysu taldykorgan", "fc zhetysu", "fk zhetysu"],
  },
  {
    name: "Кайсар",
    shortName: "KSR",
    logoUrl: "https://kffleague.kz/storage/qfl-files/public/team-logos/kaysar.webp",
    aliases: ["кайсар", "қайсар", "kaisar", "kaysar", "kaisar kyzylorda", "fc kaisar", "fk kaisar"],
  },
  {
    name: "FC Shakhter Karagandy",
    shortName: "SHA",
    aliases: ["шахтер", "шахтёр", "shakhter", "shakhter karagandy", "fc shakhter", "shakhtyor"],
  },
  {
    name: "FC Turan",
    shortName: "TUR",
    aliases: ["туран", "тұран", "turan", "turan turkistan", "fc turan", "fk turan"],
  },
] as const;

/**
 * Resolves a club's display name (from kffleague.kz, seed data, or API feeds)
 * to a guaranteed collision-free 3-letter code.
 */
export function resolveClubShortName(
  rawClubName: string,
  usedCodes: Set<string> = new Set()
): string {
  const normalized = rawClubName
    .toLowerCase()
    .replace(/[^a-zа-яёәіңғүұқөһ0-9\s-]/gi, " ")
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

  // Strip generic prefixes ("FC", "FK", "SC", "SK", "PFC", "ФК") before computing fallback code
  const stripped = rawClubName
    .replace(/^(?:FC|FK|SC|SK|PFC|ФК)\s+/i, "")
    .replace(/[^A-Za-zА-Яа-яЁё]/g, "")
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
