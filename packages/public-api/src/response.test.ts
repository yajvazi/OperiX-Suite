import test from "node:test";
import assert from "node:assert/strict";

import { collection, errorBody, PublicApiError } from "./response";

test("public API collections use the stable cursor envelope", () => {
  assert.deepEqual(collection([{ id: "1" }], { hasMore: true, nextCursor: "abc" }), { data: [{ id: "1" }], pagination: { has_more: true, next_cursor: "abc" } });
});

test("public API errors never expose internal errors", () => {
  const result = errorBody(new Error("SQL at /private/path"), "req_test");
  assert.equal(result.status, 500);
  assert.deepEqual(result.body.error, { code: "internal_error", message: "An unexpected error occurred.", request_id: "req_test" });
  const known = errorBody(new PublicApiError(409, "booking_conflict", "The requested time is no longer available."), "req_test");
  assert.equal(known.status, 409);
});
