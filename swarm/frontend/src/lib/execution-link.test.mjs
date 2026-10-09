import assert from "node:assert/strict";
import test from "node:test";
import { executionIdFromSearch } from "./execution-link.mjs";

test("reads executionId and ignores a blank value", () => {
  assert.equal(executionIdFromSearch("?executionId=ex-1"), "ex-1");
  assert.equal(executionIdFromSearch("?executionId="), null);
  assert.equal(executionIdFromSearch(""), null);
});
