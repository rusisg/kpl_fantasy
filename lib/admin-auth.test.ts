import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  verifyAdminRequest,
  verifyAdminSessionToken,
  verifyRawAdminSecret,
} from "./admin-auth";

const TEST_ADMIN_SECRET =
  "f9225bc77db022118c96f9041023a5c4168b44360bfea0d5fb29486299eeb549";

describe("Admin Authentication Service (lib/admin-auth)", () => {
  it("verifies matching raw admin secret and rejects wrong or empty secrets", () => {
    assert.equal(
      verifyRawAdminSecret(TEST_ADMIN_SECRET, TEST_ADMIN_SECRET),
      true
    );
    assert.equal(
      verifyRawAdminSecret(`  ${TEST_ADMIN_SECRET}  `, TEST_ADMIN_SECRET),
      true
    );
    assert.equal(verifyRawAdminSecret("wrong-secret", TEST_ADMIN_SECRET), false);
    assert.equal(verifyRawAdminSecret("", TEST_ADMIN_SECRET), false);
    assert.equal(verifyRawAdminSecret(null, TEST_ADMIN_SECRET), false);
  });

  it("creates and verifies signed v1 HMAC session tokens", () => {
    const signedToken = createAdminSessionToken(TEST_ADMIN_SECRET);
    assert.ok(signedToken.startsWith("v1."));
    assert.equal(
      verifyAdminSessionToken(signedToken, TEST_ADMIN_SECRET),
      true
    );
    assert.equal(
      verifyAdminSessionToken(signedToken, "different-admin-secret"),
      false
    );
    assert.equal(
      verifyAdminSessionToken("v1.0000000000000000", TEST_ADMIN_SECRET),
      false
    );
  });

  it("authorizes requests with x-admin-secret header, Bearer token, or kpl_admin_session cookie", async () => {
    const prevSecret = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;

    try {
      const signedToken = createAdminSessionToken(TEST_ADMIN_SECRET);

      const reqWithHeader = new Request("http://localhost:3000/api/admin/gameweek", {
        headers: { "x-admin-secret": TEST_ADMIN_SECRET },
      });
      assert.equal(await verifyAdminRequest(reqWithHeader), true);

      const reqWithBearer = new Request("http://localhost:3000/api/admin/gameweek", {
        headers: { Authorization: `Bearer ${TEST_ADMIN_SECRET}` },
      });
      assert.equal(await verifyAdminRequest(reqWithBearer), true);

      const reqWithCookie = new Request("http://localhost:3000/api/admin/gameweek", {
        headers: {
          cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(signedToken)}`,
        },
      });
      assert.equal(await verifyAdminRequest(reqWithCookie), true);

      const reqUnauthorized = new Request("http://localhost:3000/api/admin/gameweek");
      assert.equal(await verifyAdminRequest(reqUnauthorized), false);
    } finally {
      process.env.ADMIN_SECRET = prevSecret;
    }
  });
});
