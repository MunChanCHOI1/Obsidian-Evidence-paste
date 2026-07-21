import { test } from "node:test";
import assert from "node:assert/strict";
import { projectImageFolder, sanitizeProjectName } from "../src/utils/project";

test("sanitizeProjectName keeps letters, hyphens, underscores and Korean", () => {
	assert.equal(sanitizeProjectName("web-hacking_01"), "web-hacking_01");
	assert.equal(sanitizeProjectName("한글 프로젝트"), "한글 프로젝트");
});

test("sanitizeProjectName strips path-illegal characters", () => {
	assert.equal(sanitizeProjectName('a/b\\c:d*e?f"g<h>i|j'), "a b c d e f g h i j");
});

test("sanitizeProjectName trims and collapses whitespace and leading dots", () => {
	assert.equal(sanitizeProjectName("  ..hidden  "), "hidden");
	assert.equal(sanitizeProjectName("a   b"), "a b");
	assert.equal(sanitizeProjectName("trail.."), "trail");
});

test("sanitizeProjectName handles null/undefined/empty", () => {
	assert.equal(sanitizeProjectName(null), "");
	assert.equal(sanitizeProjectName(undefined), "");
	assert.equal(sanitizeProjectName("   "), "");
});

test("sanitizeProjectName caps very long names to 80 chars", () => {
	assert.equal(sanitizeProjectName("x".repeat(200)).length, 80);
});

test("projectImageFolder nests the project under the base folder", () => {
	assert.equal(
		projectImageFolder("attachments/evidence", "web-hacking"),
		"attachments/evidence/web-hacking"
	);
});

test("projectImageFolder falls back to the base folder for a blank project", () => {
	assert.equal(projectImageFolder("attachments/evidence", ""), "attachments/evidence");
	assert.equal(projectImageFolder("attachments/evidence/", "   "), "attachments/evidence");
});

test("projectImageFolder sanitizes the project segment", () => {
	assert.equal(
		projectImageFolder("attachments/evidence", "a/b:c"),
		"attachments/evidence/a b c"
	);
});

test("projectImageFolder works with an empty base folder", () => {
	assert.equal(projectImageFolder("", "proj"), "proj");
});
