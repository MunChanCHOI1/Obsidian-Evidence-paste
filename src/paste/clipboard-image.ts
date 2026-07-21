/*
 * Clipboard image extraction.
 *
 * MUST run synchronously inside the paste event handler: DataTransferItem /
 * DataTransfer become unusable once the event returns, so we pull out File
 * objects immediately (File.arrayBuffer() can be awaited later).
 *
 * DOUBLE-COUNT FIX:
 *   A single copied image is often exposed in MULTIPLE ways:
 *     - `clipboardData.items` may list several *renditions* of the same image
 *       (e.g. image/png AND image/jpeg) as separate file items.
 *     - `clipboardData.files` normally lists the actual file(s) once.
 *   Merging the two sources — or reading all items — double-counts. We use a
 *   single source of truth: prefer `files` (one entry per real image); fall
 *   back to `items` only when `files` is empty. A signature-based de-dupe
 *   guards against any remaining duplicates.
 */

export interface ExtractedImage {
	file: File;
	mime: string;
}

function isImageFile(file: File | null): file is File {
	return !!file && (file.type || "").startsWith("image/");
}

function collectFromFiles(files: FileList | undefined): ExtractedImage[] {
	const out: ExtractedImage[] = [];
	if (!files) {
		return out;
	}
	for (let i = 0; i < files.length; i++) {
		const file = files.item(i);
		if (isImageFile(file)) {
			out.push({ file, mime: file.type });
		}
	}
	return out;
}

function collectFromItems(items: DataTransferItemList | undefined): ExtractedImage[] {
	const out: ExtractedImage[] = [];
	if (!items) {
		return out;
	}
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.kind !== "file") {
			continue;
		}
		const file = item.getAsFile();
		if (isImageFile(file)) {
			out.push({ file, mime: file.type });
		}
	}
	return out;
}

/** Remove duplicates that share the same content signature. */
function dedupe(images: ExtractedImage[]): ExtractedImage[] {
	const seen = new Set<string>();
	const out: ExtractedImage[] = [];
	for (const img of images) {
		const f = img.file;
		const key = `${f.name}|${f.size}|${f.type}|${f.lastModified}`;
		if (!seen.has(key)) {
			seen.add(key);
			out.push(img);
		}
	}
	return out;
}

/**
 * Extract image files from clipboard data. Returns [] when there are no
 * images (e.g. a plain-text paste), which the caller uses to fall back to
 * Obsidian's default paste behavior.
 */
export function extractImagesFromClipboard(
	data: DataTransfer | null
): ExtractedImage[] {
	if (!data) {
		return [];
	}
	// Single source of truth: files[] first, items[] only as a fallback.
	const fromFiles = collectFromFiles(data.files);
	if (fromFiles.length > 0) {
		return dedupe(fromFiles);
	}
	return dedupe(collectFromItems(data.items));
}

/**
 * Diagnostic string describing what the clipboard exposed (kinds/MIME types
 * and counts only — never any content). Used for a debug log line so we can
 * pinpoint double-count causes without guessing.
 */
export function describeClipboard(data: DataTransfer | null): string {
	if (!data) {
		return "no clipboardData";
	}
	const itemDesc: string[] = [];
	if (data.items) {
		for (let i = 0; i < data.items.length; i++) {
			const it = data.items[i];
			itemDesc.push(`${it.kind}:${it.type || "?"}`);
		}
	}
	const fileDesc: string[] = [];
	if (data.files) {
		for (let i = 0; i < data.files.length; i++) {
			fileDesc.push(data.files.item(i)?.type || "?");
		}
	}
	return `items[${itemDesc.join(", ")}] files[${fileDesc.join(", ")}]`;
}

/**
 * True if the clipboard also carries meaningful text alongside images.
 * Used only for user-facing messaging; we still process images only.
 */
export function clipboardHasText(data: DataTransfer | null): boolean {
	if (!data) {
		return false;
	}
	const text = data.getData("text/plain");
	return typeof text === "string" && text.trim().length > 0;
}
