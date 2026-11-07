import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clubSupportersCode,
  clubSupportersDefaultName,
  clubSupportersSlug,
  OVERALL_LEAGUE_CODE,
  OVERALL_LEAGUE_SLUG,
} from "./system-leagues";
import {
  formatClubDisplayName,
  formatLeagueDisplayName,
  translate,
} from "./i18n";

test("system-leagues - generates deterministic slugs and codes for KPL clubs", () => {
  assert.equal(OVERALL_LEAGUE_SLUG, "overall");
  assert.equal(OVERALL_LEAGUE_CODE, "KPL-OVERALL");

  assert.equal(clubSupportersSlug("KAI"), "fans-kai");
  assert.equal(clubSupportersSlug("AST"), "fans-ast");
  assert.equal(clubSupportersSlug("AKT"), "fans-akt");

  assert.equal(clubSupportersCode("kai"), "KPL-KAI");
  assert.equal(clubSupportersCode("ast"), "KPL-AST");
  assert.equal(
    clubSupportersDefaultName("FC Kairat"),
    "FC Kairat Supporters League"
  );
});

test("system-leagues - localizes Overall Kazakhstan and Club Supporters Leagues in EN, RU, KK", () => {
  const tEn = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
    translate("en", k, v);
  const tRu = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
    translate("ru", k, v);
  const tKk = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
    translate("kk", k, v);

  const overall = { slug: "overall", name: "Overall Kazakhstan" };
  assert.equal(formatLeagueDisplayName(overall, tEn), "Overall Kazakhstan");
  assert.equal(formatLeagueDisplayName(overall, tRu), "Общий Казахстан");
  assert.equal(formatLeagueDisplayName(overall, tKk), "Жалпы Қазақстан");

  const kairatLeague = {
    slug: "fans-kai",
    name: "Кайрат Supporters League",
    club: { shortName: "KAI", name: "Кайрат" },
  };
  assert.equal(
    formatLeagueDisplayName(kairatLeague, tEn),
    "FC Kairat Supporters League"
  );
  assert.equal(
    formatLeagueDisplayName(kairatLeague, tRu),
    "Лига болельщиков ФК Кайрат"
  );
  assert.equal(
    formatLeagueDisplayName(kairatLeague, tKk),
    "Қайрат ФК жанкүйерлер лигасы"
  );

  assert.equal(
    formatClubDisplayName({ shortName: "AKT", name: "Актобе" }, tKk),
    "Ақтөбе ФК"
  );
});
