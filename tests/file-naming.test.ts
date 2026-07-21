import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildImageFileName,
	formatDisplayTimestamp,
	formatTimestamp,
	joinVaultPath,
	resolveUniquePath,
	withSuffix,
} from "../src/evidence/file-naming";

test("formatTimestamp produces YYYYMMDD_HHmmss in local time", () => {
	// month is 0-based in the Date constructor: 6 => July.
	assert.equal(formatTimestamp(new Date(2026, 6, 21, 10, 5, 3)), "20260721_100503");
});

test("formatDisplayTimestamp produces YYYY-MM-DD HH:mm:ss", () => {
	assert.equal(formatDisplayTimestamp(new Date(2026, 6, 21, 10, 5, 3)), "2026-07-21 10:05:03");
});

test("buildImageFileName joins id, timestamp and extension", () => {
	assert.equal(
		buildImageFileName("EV-001", "20260721_100503", "png"),
		"EV-001_20260721_100503.png"
	);
});

test("joinVaultPath trims trailing slashes and handles empty folder", () => {
	assert.equal(joinVaultPath("attachments/evidence", "a.png"), "attachments/evidence/a.png");
	assert.equal(joinVaultPath("attachments/evidence/", "a.png"), "attachments/evidence/a.png");
	assert.equal(joinVaultPath("", "a.png"), "a.png");
});

test("withSuffix inserts before the extension", () => {
	assert.equal(withSuffix("a.png", 2), "a_2.png");
	assert.equal(withSuffix("EV-001_20260721.png", 3), "EV-001_20260721_3.png");
});

test("withSuffix appends when there is no extension", () => {
	assert.equal(withSuffix("noext", 2), "noext_2");
	// A leading-dot name has no basename before the dot -> treated as no-ext.
	assert.equal(withSuffix(".gitignore", 2), ".gitignore_2");
});

test("resolveUniquePath returns the plain name when free", async () => {
	const path = await resolveUniquePath("f", "a.png", async () => false);
	assert.equal(path, "f/a.png");
});

test("resolveUniquePath appends _2, _3 on collision", async () => {
	const taken = new Set(["f/a.png", "f/a_2.png"]);
	const path = await resolveUniquePath("f", "a.png", async (p) => taken.has(p));
	assert.equal(path, "f/a_3.png");
});

test("resolveUniquePath throws after exhausting maxTries", async () => {
	await assert.rejects(
		() => resolveUniquePath("f", "a.png", async () => true, 3),
		/Could not find a free file name/
	);
});
