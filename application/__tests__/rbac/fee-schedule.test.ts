/**
 * fee-schedule.test.ts — Unit Tests: Hospital Fee Schedule & Encounter Presets
 * ==============================================================================
 *
 * Tests the standardized medical catalog, encounter presets, and calculation logic.
 *
 * Run with:
 *   npx -y tsx --test __tests__/rbac/fee-schedule.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FEE_SCHEDULE,
  ENCOUNTER_PRESETS,
  CATEGORY_LABELS,
  calculateInvoiceTotals,
} from "../../lib/data/fee-schedule";

describe("FEE_SCHEDULE catalog integrity", () => {
  it("contains non-empty items across all core healthcare categories", () => {
    assert.ok(FEE_SCHEDULE.length >= 10, "Should have comprehensive fee items");
    const categories = new Set(FEE_SCHEDULE.map((f) => f.category));
    assert.ok(categories.has("consultation"));
    assert.ok(categories.has("diagnostic"));
    assert.ok(categories.has("inpatient"));
    assert.ok(categories.has("procedure"));
    assert.ok(categories.has("pharmacy"));
  });

  it("all items have positive unit prices, valid codes, and departments", () => {
    FEE_SCHEDULE.forEach((item) => {
      assert.ok(item.id.length > 0);
      assert.ok(item.code.length > 0);
      assert.ok(item.description.length > 0);
      assert.ok(item.defaultUnitPrice > 0);
      assert.ok(item.unit.length > 0);
      assert.ok(item.department.length > 0);
    });
  });

  it("all categories have human-readable display labels", () => {
    Object.keys(CATEGORY_LABELS).forEach((cat) => {
      const label = CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS];
      assert.ok(label.label);
      assert.ok(label.color);
      assert.ok(label.bg);
    });
  });
});

describe("ENCOUNTER_PRESETS integrity", () => {
  it("contains all 4 key clinical encounter presets", () => {
    assert.equal(ENCOUNTER_PRESETS.length, 4);
    const ids = ENCOUNTER_PRESETS.map((p) => p.id);
    assert.ok(ids.includes("PRESET-OUTPATIENT"));
    assert.ok(ids.includes("PRESET-DIAGNOSTIC"));
    assert.ok(ids.includes("PRESET-WARD-3DAYS"));
    assert.ok(ids.includes("PRESET-EMERGENCY"));
  });

  it("all presets have non-empty line items and valid pricing", () => {
    ENCOUNTER_PRESETS.forEach((preset) => {
      assert.ok(preset.name.length > 0);
      assert.ok(preset.icon.length > 0);
      assert.ok(preset.badge.length > 0);
      assert.ok(preset.lineItems.length > 0);
      preset.lineItems.forEach((li) => {
        assert.ok(li.description.length > 0);
        assert.ok(li.quantity >= 1);
        assert.ok(li.unit_price > 0);
      });
    });
  });
});

describe("calculateInvoiceTotals", () => {
  it("calculates zero totals for empty line items", () => {
    const res = calculateInvoiceTotals([], 0);
    assert.deepEqual(res, { subtotal: 0, tax: 0, total: 0 });
  });

  it("calculates exact subtotal with 0% tax", () => {
    const items = [
      { description: "General Consultation", quantity: 1, unit_price: 50.0 },
      { description: "Prescription Pack", quantity: 1, unit_price: 65.0 },
    ];
    const res = calculateInvoiceTotals(items, 0);
    assert.equal(res.subtotal, 115.0);
    assert.equal(res.tax, 0.0);
    assert.equal(res.total, 115.0);
  });

  it("calculates 6% SST tax accurately", () => {
    const items = [
      { description: "Ward Room", quantity: 3, unit_price: 150.0 }, // 450
      { description: "Follow-up", quantity: 3, unit_price: 35.0 },  // 105
    ];
    // Subtotal: 555.00
    // Tax at 6%: 555 * 0.06 = 33.30
    // Total: 588.30
    const res = calculateInvoiceTotals(items, 6);
    assert.equal(res.subtotal, 555.0);
    assert.equal(res.tax, 33.3);
    assert.equal(res.total, 588.3);
  });

  it("calculates 8% service tax accurately", () => {
    const items = [
      { description: "Specialist Review", quantity: 1, unit_price: 100.0 },
    ];
    const res = calculateInvoiceTotals(items, 8);
    assert.equal(res.subtotal, 100.0);
    assert.equal(res.tax, 8.0);
    assert.equal(res.total, 108.0);
  });
});
