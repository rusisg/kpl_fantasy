import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTelegramDataCheckString,
  computeTelegramAuthHash,
  normalizeTelegramUser,
  verifyTelegramAuthData,
} from "./telegram-auth";

const TEST_BOT_TOKEN = "9012848004:AAHEshTE4Thecbb7m2Jc2mD5EKM_tF1_PMA";
const FIXED_NOW_SEC = 1_762_600_000;

describe("Telegram Cryptographic Verification Service (lib/telegram-auth)", () => {
  it("builds a canonical alphabetically sorted data-check-string excluding hash and empty fields", () => {
    const checkString = buildTelegramDataCheckString({
      username: "kpl_manager",
      id: 987654321,
      first_name: "Бауыржан",
      last_name: "",
      auth_date: FIXED_NOW_SEC - 60,
      hash: "deadbeef",
    });

    assert.equal(
      checkString,
      [
        `auth_date=${FIXED_NOW_SEC - 60}`,
        "first_name=Бауыржан",
        "id=987654321",
        "username=kpl_manager",
      ].join("\n")
    );
  });

  it("verifies an authentic and fresh Telegram login payload", () => {
    const basePayload: Record<string, string | number> = {
      id: 445566778,
      first_name: "Асхат",
      last_name: "Тағыберген",
      username: "askhat_kpl",
      photo_url: "https://t.me/i/userpic/320/askhat.jpg",
      auth_date: FIXED_NOW_SEC - 120,
    };
    const hash = computeTelegramAuthHash(basePayload, TEST_BOT_TOKEN);
    const signedPayload = { ...basePayload, hash };

    assert.equal(
      verifyTelegramAuthData(signedPayload, TEST_BOT_TOKEN, FIXED_NOW_SEC),
      true
    );
  });

  it("rejects payloads when any field (id, username, first_name) is tampered with", () => {
    const basePayload: Record<string, string | number> = {
      id: 445566778,
      first_name: "Асхат",
      last_name: "Тағыберген",
      username: "askhat_kpl",
      auth_date: FIXED_NOW_SEC - 300,
    };
    const hash = computeTelegramAuthHash(basePayload, TEST_BOT_TOKEN);
    const validPayload = { ...basePayload, hash };

    // Tamper with Telegram ID
    assert.equal(
      verifyTelegramAuthData(
        { ...validPayload, id: 999999999 },
        TEST_BOT_TOKEN,
        FIXED_NOW_SEC
      ),
      false
    );

    // Tamper with username
    assert.equal(
      verifyTelegramAuthData(
        { ...validPayload, username: "hacker_account" },
        TEST_BOT_TOKEN,
        FIXED_NOW_SEC
      ),
      false
    );

    // Tamper with first_name
    assert.equal(
      verifyTelegramAuthData(
        { ...validPayload, first_name: "FakeName" },
        TEST_BOT_TOKEN,
        FIXED_NOW_SEC
      ),
      false
    );
  });

  it("rejects payloads signed with a different bot token", () => {
    const basePayload: Record<string, string | number> = {
      id: 445566778,
      first_name: "Самат",
      auth_date: FIXED_NOW_SEC - 60,
    };
    const hashWithWrongBot = computeTelegramAuthHash(
      basePayload,
      "1111111111:AAWrongBotTokenSecretValue123456789"
    );

    assert.equal(
      verifyTelegramAuthData(
        { ...basePayload, hash: hashWithWrongBot },
        TEST_BOT_TOKEN,
        FIXED_NOW_SEC
      ),
      false
    );
  });

  it("rejects replay attacks when auth_date is older than 24 hours", () => {
    const expiredAuthDate = FIXED_NOW_SEC - 86_401; // 24h + 1s ago
    const basePayload: Record<string, string | number> = {
      id: 445566778,
      first_name: "Самат",
      auth_date: expiredAuthDate,
    };
    const hash = computeTelegramAuthHash(basePayload, TEST_BOT_TOKEN);

    assert.equal(
      verifyTelegramAuthData(
        { ...basePayload, hash },
        TEST_BOT_TOKEN,
        FIXED_NOW_SEC
      ),
      false
    );
  });

  it("normalizes verified Telegram user attributes and synthetic email", () => {
    const normalized = normalizeTelegramUser({
      id: 77889900,
      first_name: "Дастан",
      last_name: "Сатпаев",
      username: "dastan_kairat",
      auth_date: FIXED_NOW_SEC,
    });

    assert.equal(normalized.telegramId, "77889900");
    assert.equal(normalized.displayName, "Дастан Сатпаев");
    assert.equal(normalized.username, "dastan_kairat");
    assert.equal(normalized.syntheticEmail, "77889900@telegram.kplfantasy.kz");
  });
});
