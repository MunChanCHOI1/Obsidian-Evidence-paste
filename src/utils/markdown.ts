/*
 * Markdown safety helpers. Pure functions (no Obsidian API). These keep user
 * text from breaking the surrounding markdown structure (callouts, code
 * fences, HTML comment markers).
 */

/**
 * Wrap `content` in a fenced code block whose fence is guaranteed longer than
 * any backtick run inside the content, so embedded backticks/fences cannot
 * terminate it early. Content is preserved VERBATIM (important for payloads).
 */
export function toSafeFencedBlock(content: string, lang = "text"): string {
	const body = content ?? "";
	const runs = body.match(/`+/g) ?? [];
	let maxRun = 0;
	for (const r of runs) {
		if (r.length > maxRun) {
			maxRun = r.length;
		}
	}
	const fence = "`".repeat(Math.max(3, maxRun + 1));
	return `${fence}${lang}\n${body}\n${fence}`;
}

/**
 * Neutralize any HTML-comment terminator so a value cannot prematurely close
 * an enclosing HTML comment. A zero-width space is inserted so the visible
 * text is essentially unchanged.
 */
export function escapeCommentClose(input: string): string {
	return input.replace(/--+>/g, (m) => m.slice(0, -1) + "​>");
}

/**
 * Sanitize a scalar prose value for insertion into a callout body:
 * normalize line endings, trim trailing whitespace, neutralize comment
 * terminators. Does NOT alter internal characters like quotes/slashes/brackets
 * (payloads and prose must stay faithful).
 */
export function sanitizeScalar(input: string | null | undefined): string {
	if (input === null || input === undefined) {
		return "";
	}
	const normalized = String(input).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "");
	return escapeCommentClose(normalized).trim();
}

/**
 * Format a list of warnings as markdown bullet lines. Empty list -> "".
 */
export function formatWarnings(warnings: string[] | undefined): string {
	if (!warnings || warnings.length === 0) {
		return "";
	}
	return warnings
		.map((w) => sanitizeScalar(w))
		.filter((w) => w.length > 0)
		.map((w) => `- ${w}`)
		.join("\n");
}
