/*
 * Project helpers. Pure functions (no Obsidian API) so they are unit-testable.
 *
 * Captured images are grouped per project: each project becomes a subfolder of
 * the base attachment folder, e.g. base "attachments/evidence" + project
 * "web-hacking" -> "attachments/evidence/web-hacking".
 */

// Characters not allowed in vault/file paths.
const ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/g;
// ASCII control characters (built from an ASCII-only source string on purpose).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f]", "g");

/**
 * Clean a user-entered project name so it is safe as a single vault folder
 * segment: strip characters illegal in file paths, collapse whitespace, drop
 * leading/trailing dots and spaces, and cap the length. Korean and other
 * letters (and hyphens/underscores) are preserved.
 */
export function sanitizeProjectName(raw: string | null | undefined): string {
	if (raw === null || raw === undefined) {
		return "";
	}
	return String(raw)
		.replace(ILLEGAL_PATH_CHARS, " ")
		.replace(CONTROL_CHARS, " ")
		.replace(/\s+/g, " ")
		.replace(/^[.\s]+/, "")
		.replace(/[.\s]+$/, "")
		.slice(0, 80)
		.trim();
}

/**
 * Build the vault-relative image folder for a project. Falls back to the base
 * folder (no subfolder) when the project name is empty/blank.
 */
export function projectImageFolder(attachmentFolder: string, project: string): string {
	const base = (attachmentFolder ?? "").replace(/\/+$/, "");
	const proj = sanitizeProjectName(project);
	if (proj.length === 0) {
		return base;
	}
	return base.length > 0 ? `${base}/${proj}` : proj;
}
