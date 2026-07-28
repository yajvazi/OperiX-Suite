import assert from "node:assert/strict";
import test from "node:test";
import { journalTotals, validateJournalDraft } from "./index.ts";

test("journal totals use exact decimal arithmetic", () => {
  const totals = journalTotals([
    { accountId: "cash", debit: "0.10", credit: "0" },
    { accountId: "cash", debit: "0.20", credit: "0" },
    { accountId: "sales", debit: "0", credit: "0.30" },
  ]);
  assert.equal(totals.debit.toString(), "0.3000");
  assert.equal(totals.credit.toString(), "0.3000");
});

test("journal validation rejects unbalanced and dual-sided lines", () => {
  assert.match(
    validateJournalDraft([
      { accountId: "cash", debit: "100", credit: "0" },
      { accountId: "sales", debit: "0", credit: "99" },
    ]) ?? "",
    /equal/,
  );
  assert.match(
    validateJournalDraft([
      { accountId: "cash", debit: "100", credit: "100" },
      { accountId: "sales", debit: "0", credit: "100" },
    ]) ?? "",
    /either/,
  );
});
