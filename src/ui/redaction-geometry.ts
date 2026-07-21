/*
 * Geometry helpers for the redaction editor. Pure functions (no DOM) so the
 * fiddly coordinate math can be unit-tested without a browser. The modal keeps
 * the canvas at the image's NATURAL resolution and lets the browser scale it
 * down for display, so pointer coordinates (CSS pixels) must be mapped back to
 * canvas pixels before a rectangle is committed.
 */

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The subset of a DOMRect these helpers need. */
export interface Bounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * Map a client (CSS-pixel) point to canvas (natural-pixel) coordinates given
 * the canvas's on-screen bounds and its intrinsic pixel size.
 */
export function mapPointToCanvas(
	clientX: number,
	clientY: number,
	bounds: Bounds,
	canvasWidth: number,
	canvasHeight: number
): Point {
	const sx = bounds.width > 0 ? canvasWidth / bounds.width : 1;
	const sy = bounds.height > 0 ? canvasHeight / bounds.height : 1;
	return {
		x: (clientX - bounds.left) * sx,
		y: (clientY - bounds.top) * sy,
	};
}

/** Build a rectangle with non-negative width/height from two corner points. */
export function normalizeRect(a: Point, b: Point): Rect {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Clip a rectangle to the [0,width] x [0,height] canvas, dropping the overflow. */
export function clampRectToBounds(rect: Rect, width: number, height: number): Rect {
	const x0 = Math.max(0, Math.min(rect.x, width));
	const y0 = Math.max(0, Math.min(rect.y, height));
	const x1 = Math.max(0, Math.min(rect.x + rect.w, width));
	const y1 = Math.max(0, Math.min(rect.y + rect.h, height));
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A rectangle too small to be an intentional redaction (a stray click). */
export function isDegenerateRect(rect: Rect, minSize = 3): boolean {
	return rect.w < minSize || rect.h < minSize;
}
