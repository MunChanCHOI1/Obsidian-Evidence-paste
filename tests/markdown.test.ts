import { test } from "node:test";
import assert from "node:assert/strict";
import {
	escapeCommentClose,
	formatWarnings,
	sanitizeScalar,
	toSafeFencedBlock,
} from "../src/utils/markdown";

const ZWSP = "​";

test("toSafeFencedBlock wraps content in a triple-backtick fence by default", () => {
	assert.equal(toSafeFencedBlock("hello"), "```text\nhello\n```");
});

test("toSafeFencedBlock grows the fence past any inner backtick run", () => {
	// Content contains a ``` run, so the fence must be at least 4 backticks.
	const out = toSafeFencedBlock("before ``` after");
	assert.equal(out, "````text\nbefore ``` after\n````");
});

test("toSafeFencedBlock respects a custom language and empty content", () => {
	assert.equal(toSafeFencedBlock("x = 1", "py"), "```py\nx = 1\n```");
	assert.equal(toSafeFencedBlock(""), "```text\n\n```");
});

test("escapeCommentClose neutralizes an HTML comment terminator", () => {
	const out = escapeCommentClose("a -->b");
	assert.ok(!out.includes("-->"), "the bare --> must be gone");
	assert.ok(out.includes(`--${ZWSP}>`), "a zero-width space must split the terminator");
});

test("sanitizeScalar returns empty string for null/undefined", () => {
	assert.equal(sanitizeScalar(null), "");
	assert.equal(sanitizeScalar(undefined), "");
});

test("sanitizeScalar normalizes CRLF and trims trailing whitespace", () => {
	assert.equal(sanitizeScalar("a  \r\nb\t"), "a\nb");
});

test("sanitizeScalar neutralizes comment terminators inside the value", () => {
	assert.ok(!sanitizeScalar("payload --> rest").includes("-->"));
});

test("formatWarnings renders bullet lines and drops blanks", () => {
	assert.equal(formatWarnings(["first", "", "  ", "second"]), "- first\n- second");
});

test("formatWarnings returns empty string for empty or undefined input", () => {
	assert.equal(formatWarnings([]), "");
	assert.equal(formatWarnings(undefined), "");
});
