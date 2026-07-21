/*
 * Evidence-number logic. Pure functions only (no Obsidian API) so they are
 * easy to unit-test in stage 8.
 *
 * Rules:
 *  - Scan note content for the `<prefix>-<digits>` pattern.
 *  - Next number = max found + 1; if none, start at 1.
 *  - Zero-pad to at least `padding` digits.
 *  - Multiple images pasted at once get sequential numbers.
 */

/** Escape a string for safe use inside a RegExp. */
export function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the regex that matches `<prefix>-<digits>` not preceded by a
 * word character (so "REV-1" does not match prefix "EV").
 */
function evidenceRegExp(prefix: string): RegExp {
	return new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(prefix)}-(\\d+)`, "g");
}

/**
 * Return the highest evidence number present in `content` for `prefix`,
 * or 0 if none are found.
 */
export function findMaxEvidenceNumber(content: string, prefix: string): number {
	if (prefix.length === 0) {
		return 0;
	}
	const re = evidenceRegExp(prefix);
	let max = 0;
	let match: RegExpExecArray | null;
	while ((match = re.exec(content)) !== null) {
		const value = Number.parseInt(match[1], 10);
		if (Number.isFinite(value) && value > max) {
			max = value;
		}
	}
	return max;
}

/** Format a single evidence id, e.g. ("EV", 1, 3) -> "EV-001". */
export function formatEvidenceId(
	prefix: string,
	num: number,
	padding: number
): string {
	const safePadding = Number.isFinite(padding) && padding > 0 ? Math.floor(padding) : 1;
	const digits = String(Math.max(0, Math.floor(num)));
	return `${prefix}-${digits.padStart(safePadding, "0")}`;
}

/**
 * Compute `count` sequential evidence ids based on the current note content.
 * Example: content has EV-003, count 2 -> ["EV-004", "EV-005"].
 */
export function nextEvidenceIds(
	content: string,
	prefix: string,
	padding: number,
	count: number
): string[] {
	const start = findMaxEvidenceNumber(content, prefix) + 1;
	const ids: string[] = [];
	for (let i = 0; i < count; i++) {
		ids.push(formatEvidenceId(prefix, start + i, padding));
	}
	return ids;
}
