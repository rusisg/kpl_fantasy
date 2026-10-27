import { useEffect } from "react";
import { create } from "zustand";

export type Locale = "en" | "ru" | "kk";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  ru: "RU",
  kk: "KZ",
};

const DICTIONARY = {
  en: {
    "nav.subtitle": "Unofficial Simulator",
    "nav.squad": "Squad & Transfers",
    "nav.points": "Points",
    "nav.fixtures": "Fixtures",
    "nav.leagues": "Mini-Leagues",
    "nav.schedulePending": "Schedule Pending",
    "nav.locked": "Deadline Passed • Locked",
    "nav.locksIn": "Locks in {time}",
    "nav.newManager": "New Manager",
    "nav.manager": "Manager",
    "nav.pts": "pts",

    "squad.placeholderName": "Enter Squad Name...",
    "squad.preSeason": "Pre-Season",
    "squad.gameweek": "Gameweek {id}",
    "squad.deadline": "Deadline: {date}",
    "squad.lockedBanner": "Locked ({date})",
    "squad.players": "Players",
    "squad.bank": "Bank",
    "squad.freeTransfers": "Free Transfers",
    "squad.cost": "Cost",
    "squad.unlimited": "∞",
    "squad.autoDraft": "Auto-Draft",
    "squad.saveSquad": "Save Squad",
    "squad.saving": "Saving...",
    "squad.gwLocked": "GW Locked",
    "squad.substitutes": "Substitutes (Priority Order)",
    "squad.market": "Player Market",
    "squad.searchPlaceholder": "Search players...",
    "squad.allClubs": "All KPL Clubs",
    "squad.scouting": "Scouting players...",
    "squad.noMatch": "No players match search.",
    "squad.selectPos": "Select {pos}",
    "squad.swapBanner": "Substituting {name} — click a highlighted player to swap",
    "squad.cancelSwap": "Cancel",

    "chip.WILDCARD": "Wildcard",
    "chip.WILDCARD.desc": "Unlimited free transfers",
    "chip.FREE_HIT": "Free Hit",
    "chip.FREE_HIT.desc": "Unlimited free transfers for 1 GW",
    "chip.BENCH_BOOST": "Bench Boost",
    "chip.BENCH_BOOST.desc": "Bench points count this GW",
    "chip.TRIPLE_CAPTAIN": "Triple Captain",
    "chip.TRIPLE_CAPTAIN.desc": "Captain scores 3× points",
    "chip.play": "Play Chip",
    "chip.active": "Active • Cancel",
    "chip.used": "Used",

    "points.title": "Gameweek Points",
    "points.defaultSubtitle": "Your KPL Fantasy performance",
    "points.noSquadTitle": "No Squad Yet",
    "points.noSquadDesc": "Build and save your 15-man squad to start scoring points.",
    "points.goToSquad": "Go to Squad Builder →",
    "points.noScoredGw": "No gameweeks have been scored yet. Your points will appear here once the first gameweek is processed.",
    "points.gwPoints": "GW Points",
    "points.gwAverage": "GW Average",
    "points.gwHighest": "GW Highest",
    "points.gwRank": "GW Rank",
    "points.seasonTotal": "Season Total",
    "points.chipPlayed": "Chip played: {chip}",
    "points.benchActive": "Bench (Bench Boost active — points count)",
    "points.benchInactive": "Bench (auto-subs applied)",
    "points.seasonHistory": "Season History",
    "points.colGw": "GW",
    "points.colPoints": "Points",
    "points.colRank": "Rank",
    "points.colChip": "Chip",

    "fixtures.title": "Fixtures & Results",
    "fixtures.subtitle": "Kazakhstan Premier League match schedule",
    "fixtures.currentGw": "Current Gameweek",
    "fixtures.finished": "Finished",
    "fixtures.postponed": "Postponed",
    "fixtures.cancelled": "Cancelled",
    "fixtures.live": "Live",
    "fixtures.none": "No fixtures scheduled for Gameweek {id}.",

    "leagues.title": "Mini-Leagues & Standings",
    "leagues.subtitle": "Compete with friends across the Kazakhstan Premier League",
    "leagues.activeLeagues": "Active Leagues",
    "leagues.bestRank": "Best Rank",
    "leagues.createTitle": "Create a Mini-League",
    "leagues.createDesc": "Generates a unique 6-character invite code (e.g. KPL-8X9A)",
    "leagues.createBtn": "+ Create League",
    "leagues.creating": "Creating...",
    "leagues.joinTitle": "Join a Mini-League",
    "leagues.joinDesc": "Enter a 6-character invite code shared by a friend",
    "leagues.joinBtn": "Join League",
    "leagues.joining": "Joining...",

    "footer.attributionPrefix": "Clubs, rosters, fixtures & results sourced from",
    "footer.attributionRequired": "При использовании материалов обязательна ссылка на официальный сайт:",
  },
  ru: {
    "nav.subtitle": "Неофициальный симулятор",
    "nav.squad": "Состав и Трансферы",
    "nav.points": "Очки",
    "nav.fixtures": "Матчи",
    "nav.leagues": "Мини-Лиги",
    "nav.schedulePending": "Ожидание расписания",
    "nav.locked": "Дедлайн прошёл • Закрыто",
    "nav.locksIn": "До дедлайна {time}",
    "nav.newManager": "Новый менеджер",
    "nav.manager": "Менеджер",
    "nav.pts": "очк.",

    "squad.placeholderName": "Введите название команды...",
    "squad.preSeason": "Предсезонка",
    "squad.gameweek": "Тур {id}",
    "squad.deadline": "Дедлайн: {date}",
    "squad.lockedBanner": "Закрыто ({date})",
    "squad.players": "Игроки",
    "squad.bank": "Бюджет",
    "squad.freeTransfers": "Беспл. трансферы",
    "squad.cost": "Штраф",
    "squad.unlimited": "∞",
    "squad.autoDraft": "Авто-выбор",
    "squad.saveSquad": "Сохранить состав",
    "squad.saving": "Сохранение...",
    "squad.gwLocked": "Тур закрыт",
    "squad.substitutes": "Запасные (по приоритету выхода)",
    "squad.market": "Трансферный рынок",
    "squad.searchPlaceholder": "Поиск игроков...",
    "squad.allClubs": "Все клубы КПЛ",
    "squad.scouting": "Загрузка игроков...",
    "squad.noMatch": "Игроки не найдены.",
    "squad.selectPos": "Выберите {pos}",
    "squad.swapBanner": "Замена {name} — нажмите на подсвеченного игрока для обмена",
    "squad.cancelSwap": "Отмена",

    "chip.WILDCARD": "Уайлдкард",
    "chip.WILDCARD.desc": "Безлимитные бесплатные трансферы",
    "chip.FREE_HIT": "Фри Хит",
    "chip.FREE_HIT.desc": "Бесплатные трансферы на 1 тур",
    "chip.BENCH_BOOST": "Усиление скамейки",
    "chip.BENCH_BOOST.desc": "Очки запасных идут в зачёт",
    "chip.TRIPLE_CAPTAIN": "Тройной капитан",
    "chip.TRIPLE_CAPTAIN.desc": "Очки капитана утраиваются (3×)",
    "chip.play": "Активировать",
    "chip.active": "Активен • Отменить",
    "chip.used": "Использован",

    "points.title": "Очки тура",
    "points.defaultSubtitle": "Результаты вашей команды КПЛ Фэнтези",
    "points.noSquadTitle": "Состав ещё не создан",
    "points.noSquadDesc": "Соберите и сохраните состав из 15 игроков, чтобы набирать очки.",
    "points.goToSquad": "Перейти к сборке состава →",
    "points.noScoredGw": "Ни один тур ещё не рассчитан. Очки появятся после расчёта первого тура.",
    "points.gwPoints": "Очки тура",
    "points.gwAverage": "Средний балл",
    "points.gwHighest": "Лучший балл",
    "points.gwRank": "Место в туре",
    "points.seasonTotal": "Всего за сезон",
    "points.chipPlayed": "Активный чип: {chip}",
    "points.benchActive": "Скамейка (Усиление скамейки — очки засчитаны)",
    "points.benchInactive": "Скамейка (с учётом авто-замен)",
    "points.seasonHistory": "История сезона",
    "points.colGw": "Тур",
    "points.colPoints": "Очки",
    "points.colRank": "Место",
    "points.colChip": "Чип",

    "fixtures.title": "Календарь и результаты",
    "fixtures.subtitle": "Расписание матчей Казахстанской Премьер-Лиги",
    "fixtures.currentGw": "Текущий тур",
    "fixtures.finished": "Завершён",
    "fixtures.postponed": "Перенесён",
    "fixtures.cancelled": "Отменён",
    "fixtures.live": "В эфире",
    "fixtures.none": "Нет матчей в туре {id}.",

    "leagues.title": "Мини-лиги и таблицы",
    "leagues.subtitle": "Соревнуйтесь с друзьями в Казахстанской Премьер-Лиге",
    "leagues.activeLeagues": "Активные лиги",
    "leagues.bestRank": "Лучшее место",
    "leagues.createTitle": "Создать мини-лигу",
    "leagues.createDesc": "Генерирует уникальный 6-значный код приглашения",
    "leagues.createBtn": "+ Создать лигу",
    "leagues.creating": "Создание...",
    "leagues.joinTitle": "Вступить в мини-лигу",
    "leagues.joinDesc": "Введите 6-значный код приглашения от друга",
    "leagues.joinBtn": "Вступить",
    "leagues.joining": "Вход...",

    "footer.attributionPrefix": "Данные клубов, составов, календаря и результатов:",
    "footer.attributionRequired": "При использовании материалов обязательна ссылка на официальный сайт:",
  },
  kk: {
    "nav.subtitle": "Бейресми симулятор",
    "nav.squad": "Құрам және Трансферлер",
    "nav.points": "Ұпайлар",
    "nav.fixtures": "Кесте",
    "nav.leagues": "Мини-Лигалар",
    "nav.schedulePending": "Кесте күтілуде",
    "nav.locked": "Дедлайн өтті • Жабық",
    "nav.locksIn": "Дедлайнға {time}",
    "nav.newManager": "Жаңа менеджер",
    "nav.manager": "Менеджер",
    "nav.pts": "ұп.",

    "squad.placeholderName": "Команда атауын енгізіңіз...",
    "squad.preSeason": "Маусым алды",
    "squad.gameweek": "{id}-тур",
    "squad.deadline": "Дедлайн: {date}",
    "squad.lockedBanner": "Жабық ({date})",
    "squad.players": "Ойыншылар",
    "squad.bank": "Банк",
    "squad.freeTransfers": "Тегін трансфер",
    "squad.cost": "Айыппұл",
    "squad.unlimited": "∞",
    "squad.autoDraft": "Авто-таңдау",
    "squad.saveSquad": "Құрамды сақтау",
    "squad.saving": "Сақталуда...",
    "squad.gwLocked": "Тур жабық",
    "squad.substitutes": "Қосалқы құрам (шығу ретімен)",
    "squad.market": "Ойыншылар нарығы",
    "squad.searchPlaceholder": "Ойыншы іздеу...",
    "squad.allClubs": "Барлық ҚПЛ клубтары",
    "squad.scouting": "Ойыншылар жүктелуде...",
    "squad.noMatch": "Ойыншылар табылмады.",
    "squad.selectPos": "{pos} таңдаңыз",
    "squad.swapBanner": "{name} ауыстыру — алмастыру үшін белгіленген ойыншыны басыңыз",
    "squad.cancelSwap": "Болдырмау",

    "chip.WILDCARD": "Уайлдкард",
    "chip.WILDCARD.desc": "Шексіз тегін трансферлер",
    "chip.FREE_HIT": "Фри Хит",
    "chip.FREE_HIT.desc": "1 турға шексіз тегін трансфер",
    "chip.BENCH_BOOST": "Қосалқы күш",
    "chip.BENCH_BOOST.desc": "Қосалқы ойыншылар ұпайы есептеледі",
    "chip.TRIPLE_CAPTAIN": "Үштік капитан",
    "chip.TRIPLE_CAPTAIN.desc": "Капитан ұпайы 3 есе көбейеді (3×)",
    "chip.play": "Қосу",
    "chip.active": "Белсенді • Өшіру",
    "chip.used": "Қолданылды",

    "points.title": "Тур ұпайлары",
    "points.defaultSubtitle": "ҚПЛ Фэнтези командаңыздың нәтижесі",
    "points.noSquadTitle": "Құрам әлі жоқ",
    "points.noSquadDesc": "Ұпай жинау үшін 15 ойыншыдан тұратын құрамды жинап, сақтаңыз.",
    "points.goToSquad": "Құрам жинауға өту →",
    "points.noScoredGw": "Әзірге ешбір тур есептелген жоқ. Алғашқы тур аяқталған соң ұпайлар осында шығады.",
    "points.gwPoints": "Тур ұпайы",
    "points.gwAverage": "Орташа ұпай",
    "points.gwHighest": "Ең жоғары",
    "points.gwRank": "Турдағы орын",
    "points.seasonTotal": "Жалпы ұпай",
    "points.chipPlayed": "Қолданылған чип: {chip}",
    "points.benchActive": "Қосалқы құрам (Қосалқы күш қосулы — ұпай есептеледі)",
    "points.benchInactive": "Қосалқы құрам (авто-алмасулар ескерілді)",
    "points.seasonHistory": "Маусым тарихы",
    "points.colGw": "Тур",
    "points.colPoints": "Ұпай",
    "points.colRank": "Орын",
    "points.colChip": "Чип",

    "fixtures.title": "Кесте және Нәтижелер",
    "fixtures.subtitle": "Қазақстан Премьер-Лигасының матчтар кестесі",
    "fixtures.currentGw": "Ағымдағы тур",
    "fixtures.finished": "Аяқталды",
    "fixtures.postponed": "Кейінге шегерілді",
    "fixtures.cancelled": "Болдырылмады",
    "fixtures.live": "Тікелей",
    "fixtures.none": "{id}-турға матчтар жоспарланбаған.",

    "leagues.title": "Мини-Лигалар мен Кесте",
    "leagues.subtitle": "Қазақстан Премьер-Лигасы бойынша достарыңызбен жарысыңыз",
    "leagues.activeLeagues": "Белсенді лигалар",
    "leagues.bestRank": "Үздік орын",
    "leagues.createTitle": "Мини-лига құру",
    "leagues.createDesc": "6 таңбалы бірегей шақыру кодын жасайды (мыс. KPL-8X9A)",
    "leagues.createBtn": "+ Лига құру",
    "leagues.creating": "Құрылуда...",
    "leagues.joinTitle": "Мини-лигаға қосылу",
    "leagues.joinDesc": "Досыңыз жіберген 6 таңбалы шақыру кодын енгізіңіз",
    "leagues.joinBtn": "Қосылу",
    "leagues.joining": "Қосылуда...",

    "footer.attributionPrefix": "Клубтар, құрамдар, кесте және нәтижелер деректері:",
    "footer.attributionRequired": "При использовании материалов обязательна ссылка на официальный сайт:",
  },
} as const;

export type TranslationKey = keyof typeof DICTIONARY.en;

interface LocaleStoreState {
  locale: Locale;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  hydrateLocale: () => void;
}

const STORAGE_KEY = "kpl_fantasy_locale";

export const useLocaleStore = create<LocaleStoreState>((set, get) => ({
  locale: "en",
  hydrated: false,
  setLocale: (locale) => {
    set({ locale });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // Ignore storage errors
      }
    }
  },
  hydrateLocale: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "ru" || stored === "kk") {
        set({ locale: stored, hydrated: true });
        return;
      }
    } catch {
      // Ignore storage errors
    }
    set({ hydrated: true });
  },
}));

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const table = DICTIONARY[locale] ?? DICTIONARY.en;
  let text: string = table[key] ?? DICTIONARY.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function useTranslation() {
  const { locale, setLocale, hydrateLocale } = useLocaleStore();

  useEffect(() => {
    hydrateLocale();
  }, [hydrateLocale]);

  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  return { locale, setLocale, t };
}

