/**
 * current-user.test.ts — Unit Tests: Role Extraction & Normalization
 * ====================================================================
 *
 * Tests extractRoleFromUser and resolveRoleFromDb fallback logic.
 *
 * Run with:
 *   npx -y tsx --test __tests__/rbac/current-user.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractRoleFromUser, resolveRoleFromDb } from "../../lib/auth/current-user";

describe("extractRoleFromUser — role mapping & normalization", () => {
  it("extracts doctor role from namespaced claim", () => {
    const user = { "https://medisync.app/role": "doctor" };
    assert.equal(extractRoleFromUser(user), "doctor");
  });

  it("extracts nurse role from namespaced claim", () => {
    const user = { "https://medisync.app/role": "nurse" };
    assert.equal(extractRoleFromUser(user), "nurse");
  });

  it("extracts admin role from namespaced claim", () => {
    const user = { "https://medisync.app/role": "admin" };
    assert.equal(extractRoleFromUser(user), "admin");
  });

  it("falls back to top-level role claim", () => {
    const user = { role: "nurse" };
    assert.equal(extractRoleFromUser(user), "nurse");
  });

  it("normalizes 'staff' string to 'doctor'", () => {
    const user = { "https://medisync.app/role": "staff" };
    assert.equal(extractRoleFromUser(user), "doctor");
  });

  it("normalizes unknown role strings to 'doctor'", () => {
    const user = { "https://medisync.app/role": "superadmin" };
    assert.equal(extractRoleFromUser(user), "doctor");
  });

  it("normalizes empty object to 'doctor'", () => {
    const user = {};
    assert.equal(extractRoleFromUser(user), "doctor");
  });
});

describe("resolveRoleFromDb — database lookup with JWT fallback", () => {
  it("uses DB role when DB returns a valid user row", async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { role: "admin" },
              error: null,
            }),
          }),
        }),
      }),
    };

    const fallbackUser = { "https://medisync.app/role": "doctor" };
    const role = await resolveRoleFromDb(fakeSupabase as any, "auth0|admin-user", fallbackUser);
    assert.equal(role, "admin");
  });

  it("falls back to JWT claim when DB row is missing", async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    };

    const fallbackUser = { "https://medisync.app/role": "nurse" };
    const role = await resolveRoleFromDb(fakeSupabase as any, "auth0|nurse-user", fallbackUser);
    assert.equal(role, "nurse");
  });

  it("falls back to JWT claim when DB throws an error", async () => {
    const fakeSupabase = {
      from: () => {
        throw new Error("DB connection timeout");
      },
    };

    const fallbackUser = { "https://medisync.app/role": "admin" };
    const role = await resolveRoleFromDb(fakeSupabase as any, "auth0|admin-user", fallbackUser);
    assert.equal(role, "admin");
  });
});
