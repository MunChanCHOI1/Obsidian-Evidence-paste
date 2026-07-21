import { test } from "node:test";
import assert from "node:assert/strict";
import {
	escapeRegExp,
	findMaxEvidenceNumber,
	formatEvidenceId,
	nextEvidenceIds,
} from "../src/evidence/evidence-id";

test("escapeRegExp escapes regex metacharacters", () => {
	assert.equal(escapeRegExp("a.b*c"), "a\\.b\\*c");
	assert.equal(escapeRegExp("EV"), "EV");
	assert.equal(escapeRegExp("[x]"), "\\[x\\]");
});

test("findMaxEvidenceNumber returns 0 when none present", () => {
	assert.equal(findMaxEvidenceNumber("no ids here", "EV"), 0);
	assert.equal(findMaxEvidenceNumber("", "EV"), 0);
});

test("findMaxEvidenceNumber returns the highest number", () => {
	assert.equal(findMaxEvidenceNumber("EV-001 then EV-003 then EV-002", "EV"), 3);
	assert.equal(findMaxEvidenceNumber("### 증적 EV-010", "EV"), 10);
});

test("findMaxEvidenceNumber respects the word boundary before the prefix", () => {
	// "REV-9" must NOT match prefix "EV" (preceded by a word char).
	assert.equal(findMaxEvidenceNumber("REV-9 and EV-2", "EV"), 2);
});

test("findMaxEvidenceNumber isolates different prefixes", () => {
	assert.equal(findMaxEvidenceNumber("EV-5 IMG-99", "IMG"), 99);
	assert.equal(findMaxEvidenceNumber("EV-5 IMG-99", "EV"), 5);
});

test("findMaxEvidenceNumber with empty prefix returns 0", () => {
	assert.equal(findMaxEvidenceNumber("EV-5", ""), 0);
});

test("formatEvidenceId zero-pads to the requested width", () => {
	assert.equal(formatEvidenceId("EV", 1, 3), "EV-001");
	assert.equal(formatEvidenceId("EV", 42, 3), "EV-042");
	assert.equal(formatEvidenceId("EV", 1234, 3), "EV-1234");
});

test("formatEvidenceId tolerates invalid padding", () => {
	assert.equal(formatEvidenceId("EV", 1, 0), "EV-1");
	assert.equal(formatEvidenceId("EV", 1, -3), "EV-1");
	assert.equal(formatEvidenceId("EV", 1, Number.NaN), "EV-1");
});

test("nextEvidenceIds continues from the max present", () => {
	assert.deepEqual(nextEvidenceIds("previously EV-004", "EV", 3, 2), ["EV-005", "EV-006"]);
});

test("nextEvidenceIds starts at 1 for a fresh note", () => {
	assert.deepEqual(nextEvidenceIds("nothing here", "EV", 3, 1), ["EV-001"]);
});

test("nextEvidenceIds returns an empty array for count 0", () => {
	assert.deepEqual(nextEvidenceIds("EV-002", "EV", 3, 0), []);
});
