import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clampRectToBounds,
	isDegenerateRect,
	mapPointToCanvas,
	normalizeRect,
} from "../src/ui/redaction-geometry";

test("mapPointToCanvas scales a displayed point back to canvas pixels", () => {
	// Canvas is 1000x500 natural, displayed at 500x250 offset by (100, 50).
	const bounds = { left: 100, top: 50, width: 500, height: 250 };
	const p = mapPointToCanvas(350, 175, bounds, 1000, 500);
	assert.deepEqual(p, { x: 500, y: 250 }); // (250 * 2, 125 * 2)
});

test("mapPointToCanvas is identity at 1:1 with no offset", () => {
	const bounds = { left: 0, top: 0, width: 800, height: 600 };
	assert.deepEqual(mapPointToCanvas(40, 30, bounds, 800, 600), { x: 40, y: 30 });
});

test("mapPointToCanvas tolerates zero-size bounds without dividing by zero", () => {
	const bounds = { left: 0, top: 0, width: 0, height: 0 };
	const p = mapPointToCanvas(10, 20, bounds, 100, 100);
	assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test("normalizeRect yields non-negative width/height regardless of drag direction", () => {
	assert.deepEqual(normalizeRect({ x: 30, y: 40 }, { x: 10, y: 15 }), {
		x: 10,
		y: 15,
		w: 20,
		h: 25,
	});
	assert.deepEqual(normalizeRect({ x: 10, y: 15 }, { x: 30, y: 40 }), {
		x: 10,
		y: 15,
		w: 20,
		h: 25,
	});
});

test("clampRectToBounds clips a rectangle that runs past the canvas edges", () => {
	const clipped = clampRectToBounds({ x: -10, y: -5, w: 40, h: 30 }, 100, 100);
	assert.deepEqual(clipped, { x: 0, y: 0, w: 30, h: 25 });
});

test("clampRectToBounds clips the far corner too", () => {
	const clipped = clampRectToBounds({ x: 90, y: 90, w: 50, h: 50 }, 100, 100);
	assert.deepEqual(clipped, { x: 90, y: 90, w: 10, h: 10 });
});

test("isDegenerateRect flags tiny stray clicks", () => {
	assert.equal(isDegenerateRect({ x: 0, y: 0, w: 1, h: 40 }), true);
	assert.equal(isDegenerateRect({ x: 0, y: 0, w: 40, h: 2 }), true);
	assert.equal(isDegenerateRect({ x: 0, y: 0, w: 40, h: 40 }), false);
});
