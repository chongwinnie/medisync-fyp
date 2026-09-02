/**
 * role-guard.test.ts — Unit Tests: canAccessRoute() and canAccessNavItem()
 * =========================================================================
 *
 * Tests the Next.js route guard logic in lib/auth/role-guard.ts
 *
 * Run with:
 *   npx -y tsx --test __tests__/rbac/role-guard.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessRoute,
  canAccessNavItem,
  ROUTE_ACCESS,
  type Role,
} from "../../lib/auth/role-guard";

// ---------------------------------------------------------------------------
// 1. ROUTE_ACCESS contract — sanity check the shape
// ---------------------------------------------------------------------------
describe("ROUTE_ACCESS contract", () => {
  it("contains entries for protected routes", () => {
    assert.ok(ROUTE_ACCESS["/dashboard"]);
    assert.ok(ROUTE_ACCESS["/staff"]);
    assert.ok(ROUTE_ACCESS["/inventory"]);
    assert.ok(ROUTE_ACCESS["/settings"]);
    assert.ok(ROUTE_ACCESS["/billing"]);
    assert.ok(ROUTE_ACCESS["/reports"]);
  });

  it("admin is in every protected route entry", () => {
    Object.entries(ROUTE_ACCESS).forEach(([path, roles]) => {
      assert.ok(roles.includes("admin"), `admin should have access to ${path}`);
    });
  });

  it("staff route is restricted to admin only", () => {
    assert.deepEqual(ROUTE_ACCESS["/staff"], ["admin"]);
  });

  it("settings route is restricted to admin only", () => {
    assert.deepEqual(ROUTE_ACCESS["/settings"], ["admin"]);
  });

  it("reports route is restricted to admin only", () => {
    assert.deepEqual(ROUTE_ACCESS["/reports"], ["admin"]);
  });

  it("inventory route is accessible to nurse and admin", () => {
    assert.ok(ROUTE_ACCESS["/inventory"].includes("nurse"));
    assert.ok(ROUTE_ACCESS["/inventory"].includes("admin"));
    assert.ok(!ROUTE_ACCESS["/inventory"].includes("doctor"));
  });

  it("billing route is accessible to nurse and admin", () => {
    assert.ok(ROUTE_ACCESS["/billing"].includes("nurse"));
    assert.ok(ROUTE_ACCESS["/billing"].includes("admin"));
    assert.ok(!ROUTE_ACCESS["/billing"].includes("doctor"));
  });
});

// ---------------------------------------------------------------------------
// 2. canAccessRoute — positive cases per role
// ---------------------------------------------------------------------------
describe("canAccessRoute — doctor positive cases", () => {
  const role: Role = "doctor";

  it("allows /dashboard", () => {
    assert.equal(canAccessRoute(role, "/dashboard"), true);
  });

  it("allows /patients", () => {
    assert.equal(canAccessRoute(role, "/patients"), true);
  });

  it("allows /appointments", () => {
    assert.equal(canAccessRoute(role, "/appointments"), true);
  });

  it("allows /diagnostics", () => {
    assert.equal(canAccessRoute(role, "/diagnostics"), true);
  });

  it("allows /chat", () => {
    assert.equal(canAccessRoute(role, "/chat"), true);
  });

  it("allows /notifications", () => {
    assert.equal(canAccessRoute(role, "/notifications"), true);
  });
});

describe("canAccessRoute — nurse positive cases", () => {
  const role: Role = "nurse";

  it("allows /dashboard", () => {
    assert.equal(canAccessRoute(role, "/dashboard"), true);
  });

  it("allows /patients", () => {
    assert.equal(canAccessRoute(role, "/patients"), true);
  });

  it("allows /appointments", () => {
    assert.equal(canAccessRoute(role, "/appointments"), true);
  });

  it("allows /inventory", () => {
    assert.equal(canAccessRoute(role, "/inventory"), true);
  });

  it("allows /billing", () => {
    assert.equal(canAccessRoute(role, "/billing"), true);
  });

  it("allows /chat", () => {
    assert.equal(canAccessRoute(role, "/chat"), true);
  });
});

describe("canAccessRoute — admin positive cases", () => {
  const role: Role = "admin";

  it("allows /dashboard", () => {
    assert.equal(canAccessRoute(role, "/dashboard"), true);
  });

  it("allows /staff", () => {
    assert.equal(canAccessRoute(role, "/staff"), true);
  });

  it("allows /inventory", () => {
    assert.equal(canAccessRoute(role, "/inventory"), true);
  });

  it("allows /billing", () => {
    assert.equal(canAccessRoute(role, "/billing"), true);
  });

  it("allows /reports", () => {
    assert.equal(canAccessRoute(role, "/reports"), true);
  });

  it("allows /settings", () => {
    assert.equal(canAccessRoute(role, "/settings"), true);
  });
});

// ---------------------------------------------------------------------------
// 3. canAccessRoute — negative cases (denied routes)
// ---------------------------------------------------------------------------
describe("canAccessRoute — doctor denied routes", () => {
  const role: Role = "doctor";

  it("denies /staff", () => {
    assert.equal(canAccessRoute(role, "/staff"), false);
  });

  it("denies /settings", () => {
    assert.equal(canAccessRoute(role, "/settings"), false);
  });

  it("denies /inventory", () => {
    assert.equal(canAccessRoute(role, "/inventory"), false);
  });

  it("denies /billing", () => {
    assert.equal(canAccessRoute(role, "/billing"), false);
  });

  it("denies /reports", () => {
    assert.equal(canAccessRoute(role, "/reports"), false);
  });
});

describe("canAccessRoute — nurse denied routes", () => {
  const role: Role = "nurse";

  it("denies /staff", () => {
    assert.equal(canAccessRoute(role, "/staff"), false);
  });

  it("denies /settings", () => {
    assert.equal(canAccessRoute(role, "/settings"), false);
  });

  it("denies /reports", () => {
    assert.equal(canAccessRoute(role, "/reports"), false);
  });
});

// ---------------------------------------------------------------------------
// 4. canAccessRoute — null/undefined role
// ---------------------------------------------------------------------------
describe("canAccessRoute — null/undefined role", () => {
  it("denies /dashboard for null role", () => {
    assert.equal(canAccessRoute(null, "/dashboard"), false);
  });

  it("denies /patients for null role", () => {
    assert.equal(canAccessRoute(null, "/patients"), false);
  });

  it("denies /staff for null role", () => {
    assert.equal(canAccessRoute(null, "/staff"), false);
  });

  it("denies /chat for null role", () => {
    assert.equal(canAccessRoute(null, "/chat"), false);
  });

  it("denies /dashboard for undefined role", () => {
    assert.equal(canAccessRoute(undefined as unknown as Role, "/dashboard"), false);
  });
});

// ---------------------------------------------------------------------------
// 5. canAccessRoute — path normalization
// ---------------------------------------------------------------------------
describe("canAccessRoute — path normalization", () => {
  it("normalizes trailing slash: /dashboard/ → matches /dashboard", () => {
    assert.equal(canAccessRoute("doctor", "/dashboard/"), true);
  });

  it("normalizes trailing slash: /staff/ → denies for doctor", () => {
    assert.equal(canAccessRoute("doctor", "/staff/"), false);
  });

  it("normalizes trailing slash: /staff/ → allows for admin", () => {
    assert.equal(canAccessRoute("admin", "/staff/"), true);
  });

  it("strips query string: /staff?tab=shifts → denies for doctor", () => {
    assert.equal(canAccessRoute("doctor", "/staff?tab=shifts"), false);
  });

  it("strips query string: /dashboard?view=list → allows for nurse", () => {
    assert.equal(canAccessRoute("nurse", "/dashboard?view=list"), true);
  });

  it("normalizes root / to /dashboard → allows for doctor", () => {
    assert.equal(canAccessRoute("doctor", "/"), true);
  });
});

// ---------------------------------------------------------------------------
// 6. canAccessRoute — sub-path matching
// ---------------------------------------------------------------------------
describe("canAccessRoute — sub-path matching", () => {
  it("allows /patients/PT-1001 for doctor (inherits /patients)", () => {
    assert.equal(canAccessRoute("doctor", "/patients/PT-1001"), true);
  });

  it("allows /patients/PT-1001/notes for doctor", () => {
    assert.equal(canAccessRoute("doctor", "/patients/PT-1001/notes"), true);
  });

  it("denies /staff/john/shifts for doctor (inherits /staff)", () => {
    assert.equal(canAccessRoute("doctor", "/staff/john/shifts"), false);
  });

  it("allows /staff/john/shifts for admin", () => {
    assert.equal(canAccessRoute("admin", "/staff/john/shifts"), true);
  });

  it("allows /billing/invoices for nurse", () => {
    assert.equal(canAccessRoute("nurse", "/billing/invoices"), true);
  });

  it("allows /billing/invoices/inv-001 for admin", () => {
    assert.equal(canAccessRoute("admin", "/billing/invoices/inv-001"), true);
  });

  it("denies /billing/invoices/inv-001 for doctor", () => {
    assert.equal(canAccessRoute("doctor", "/billing/invoices/inv-001"), false);
  });
});

// ---------------------------------------------------------------------------
// 7. canAccessNavItem
// ---------------------------------------------------------------------------
describe("canAccessNavItem tests", () => {
  it("delegates to canAccessRoute correctly", () => {
    assert.equal(canAccessNavItem("doctor", "/dashboard"), true);
    assert.equal(canAccessNavItem("doctor", "/staff"), false);
    assert.equal(canAccessNavItem("nurse", "/inventory"), true);
    assert.equal(canAccessNavItem("admin", "/staff"), true);
    assert.equal(canAccessNavItem(null, "/dashboard"), false);
  });
});

// ---------------------------------------------------------------------------
// 8. Cross-role full matrix
// ---------------------------------------------------------------------------
describe("canAccessRoute — exhaustive matrix", () => {
  const MATRIX: [Role, string, boolean][] = [
    // Doctor
    ["doctor", "/dashboard", true],
    ["doctor", "/appointments", true],
    ["doctor", "/patients", true],
    ["doctor", "/diagnostics", true],
    ["doctor", "/chat", true],
    ["doctor", "/notifications", true],
    ["doctor", "/inventory", false],
    ["doctor", "/staff", false],
    ["doctor", "/billing", false],
    ["doctor", "/reports", false],
    ["doctor", "/settings", false],

    // Nurse
    ["nurse", "/dashboard", true],
    ["nurse", "/appointments", true],
    ["nurse", "/patients", true],
    ["nurse", "/diagnostics", true],
    ["nurse", "/inventory", true],
    ["nurse", "/billing", true],
    ["nurse", "/chat", true],
    ["nurse", "/notifications", true],
    ["nurse", "/staff", false],
    ["nurse", "/reports", false],
    ["nurse", "/settings", false],

    // Admin
    ["admin", "/dashboard", true],
    ["admin", "/appointments", true],
    ["admin", "/patients", true],
    ["admin", "/diagnostics", true],
    ["admin", "/inventory", true],
    ["admin", "/staff", true],
    ["admin", "/billing", true],
    ["admin", "/reports", true],
    ["admin", "/chat", true],
    ["admin", "/notifications", true],
    ["admin", "/settings", true],
  ];

  MATRIX.forEach(([role, path, expected]) => {
    it(`canAccessRoute("${role}", "${path}") === ${expected}`, () => {
      assert.equal(canAccessRoute(role, path), expected);
    });
  });
});
