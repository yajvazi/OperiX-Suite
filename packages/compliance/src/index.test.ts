import assert from "node:assert/strict";
import test from "node:test";
import {
  selectEffectiveConfig,
  type EffectiveConfigVersion,
} from "./index.ts";

const versions: EffectiveConfigVersion<"rounding_rules">[] = [
  {
    id: "old",
    type: "rounding_rules",
    version: 1,
    status: "active",
    effectiveFrom: "2025-01-01",
    effectiveUntil: "2025-12-31",
    payload: {
      monetaryScale: 2,
      unitPriceScale: 4,
      quantityScale: 3,
      mode: "half-up",
      taxRounding: "per-line",
    },
  },
  {
    id: "current",
    type: "rounding_rules",
    version: 2,
    status: "active",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    payload: {
      monetaryScale: 2,
      unitPriceScale: 4,
      quantityScale: 3,
      mode: "half-even",
      taxRounding: "per-document",
    },
  },
];

test("selects configuration by effective date", () => {
  assert.equal(selectEffectiveConfig(versions, "2025-06-01")?.id, "old");
  assert.equal(selectEffectiveConfig(versions, "2026-07-27")?.id, "current");
  assert.equal(selectEffectiveConfig(versions, "2024-12-31"), null);
});
