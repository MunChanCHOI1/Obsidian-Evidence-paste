/*
 * Image file-name generation. Pure functions plus one async uniqueness
 * resolver that takes an injected `exists` checker (so it stays testable and
 * decoupled from the Obsidian Vault API).
 *
 * Base format: `<evidenceId>_YYYYMMDD_HHmmss.<ext>`
 * e.g. `EV-001_20260720_103500.png`
 *
 * Collision handling: if the target path already exists, append `_2`, `_3`, …
 * before the extension until a free name is found.
 */

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** Format a Date as `YYYYMMDD_HHmmss` in LOCAL time. */
export function formatTimestamp(date: Date): string {
	const y = date.getFullYear();
	const mo = pad2(date.getMonth() + 1);
	const d = pad2(date.getDate());
	const h = pad2(date.getHours());
	const mi = pad2(date.getMinutes());
	const s = pad2(date.getSeconds());
	return `${y}${mo}${d}_${h}${mi}${s}`;
}

/** Format a Date as `YYYY-MM-DD HH:mm:ss` in LOCAL time (for display). */
export function formatDisplayTimestamp(date: Date): string {
	const y = date.getFullYear();
	const mo = pad2(date.getMonth() + 1);
	const d = pad2(date.getDate());
	const h = pad2(date.getHours());
	const mi = pad2(date.getMinutes());
	const s = pad2(date.getSeconds());
	return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/** Build the base file name (no folder), e.g. "EV-001_20260720_103500.png". */
export function buildImageFileName(
	evidenceId: string,
	timestamp: string,
	ext: string
): string {
	return `${evidenceId}_${timestamp}.${ext}`;
}

/** Join a folder and a file name into a vault path with forward slashes. */
export function joinVaultPath(folder: string, fileName: string): string {
	const cleanFolder = folder.replace(/\/+$/, "");
	return cleanFolder.length > 0 ? `${cleanFolder}/${fileName}` : fileName;
}

/** Insert a `_n` suffix before the extension: "a.png" + 2 -> "a_2.png". */
export function withSuffix(fileName: string, n: number): string {
	const dot = fileName.lastIndexOf(".");
	if (dot <= 0) {
		return `${fileName}_${n}`;
	}
	return `${fileName.slice(0, dot)}_${n}${fileName.slice(dot)}`;
}

/**
 * Resolve a unique vault path for `fileName` inside `folder`, using the
 * injected `exists` checker. Tries the plain name first, then `_2`, `_3`, …
 * Gives up after `maxTries` and throws, to avoid an infinite loop.
 */
export async function resolveUniquePath(
	folder: string,
	fileName: string,
	exists: (path: string) => Promise<boolean>,
	maxTries = 1000
): Promise<string> {
	const first = joinVaultPath(folder, fileName);
	if (!(await exists(first))) {
		return first;
	}
	for (let n = 2; n <= maxTries; n++) {
		const candidate = joinVaultPath(folder, withSuffix(fileName, n));
		if (!(await exists(candidate))) {
			return candidate;
		}
	}
	throw new Error(`Could not find a free file name for ${fileName} after ${maxTries} tries`);
}
