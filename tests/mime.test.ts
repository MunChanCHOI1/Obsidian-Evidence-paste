import { test } from "node:test";
import assert from "node:assert/strict";
import {
	extensionForMime,
	isSupportedImageMime,
	normalizeMime,
	supportedMimeList,
} from "../src/utils/mime";

test("normalizeMime strips parameters and lower-cases", () => {
	assert.equal(normalizeMime("image/PNG"), "image/png");
	assert.equal(normalizeMime("image/jpeg; charset=binary"), "image/jpeg");
	assert.equal(normalizeMime("  image/webp  "), "image/webp");
});

test("isSupportedImageMime accepts the known image types", () => {
	for (const m of ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]) {
		assert.ok(isSupportedImageMime(m), `${m} should be supported`);
	}
});

test("isSupportedImageMime rejects unknown types", () => {
	assert.equal(isSupportedImageMime("image/bmp"), false);
	assert.equal(isSupportedImageMime("text/plain"), false);
	assert.equal(isSupportedImageMime("application/pdf"), false);
});

test("extensionForMime maps to canonical extensions", () => {
	assert.equal(extensionForMime("image/png"), "png");
	assert.equal(extensionForMime("image/jpeg"), "jpg");
	assert.equal(extensionForMime("image/jpg"), "jpg");
	assert.equal(extensionForMime("image/webp"), "webp");
	assert.equal(extensionForMime("image/gif"), "gif");
});

test("extensionForMime returns null for unsupported types", () => {
	assert.equal(extensionForMime("image/bmp"), null);
});

test("supportedMimeList lists canonical types without the jpg alias", () => {
	const list = supportedMimeList();
	assert.ok(list.includes("image/jpeg"));
	assert.ok(!list.includes("image/jpg"));
});
