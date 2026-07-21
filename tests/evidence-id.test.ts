import { test } from "node:test";
import assert from "node:assert/strict";
import {
	computeNextStart,
	counterKey,
	escapeRegExp,
	findMaxEvidenceNumber,
	formatEvidenceId,
	nextEvidenceIds,
	nextEvidenceIdsScoped,
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

test("counterKey is stable and separates project from prefix", () => {
	assert.equal(counterKey("proj-a", "EV"), counterKey("proj-a", "EV"));
	assert.notEqual(counterKey("proj-a", "EV"), counterKey("proj-b", "EV"));
	assert.notEqual(counterKey("proj", "EV"), counterKey("proj", "RC"));
});

test("computeNextStart takes the max of counter and content, then +1", () => {
	assert.equal(computeNextStart(0, 0), 1); // fresh
	assert.equal(computeNextStart(5, 0), 6); // counter leads (id in another note)
	assert.equal(computeNextStart(3, 10), 11); // hand-typed id in note leads
	assert.equal(computeNextStart(-2, -5), 1); // junk -> fresh
});

test("nextEvidenceIdsScoped stays unique across notes via the counter", () => {
	// Note is empty but the project counter says 7 were already used elsewhere.
	const r = nextEvidenceIdsScoped("", "EV", 3, 2, 7);
	assert.deepEqual(r.ids, ["EV-008", "EV-009"]);
	assert.equal(r.lastUsed, 9);
});

test("nextEvidenceIdsScoped respects ids already present in the note", () => {
	const r = nextEvidenceIdsScoped("see EV-050", "EV", 3, 1, 3);
	assert.deepEqual(r.ids, ["EV-051"]);
	assert.equal(r.lastUsed, 51);
});

test("nextEvidenceIdsScoped with count 0 does not lower the counter", () => {
	const r = nextEvidenceIdsScoped("", "EV", 3, 0, 9);
	assert.deepEqual(r.ids, []);
	assert.equal(r.lastUsed, 9);
});
