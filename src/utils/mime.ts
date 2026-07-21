/*
 * Image MIME-type handling.
 *
 * We only accept a known set of image types and map each to a canonical file
 * extension. Unknown/unsupported MIME types are REFUSED rather than being
 * silently saved as `.png`, per the project requirements.
 */

/** Canonical extension per supported image MIME type. */
const SUPPORTED_IMAGE_MIME: Readonly<Record<string, string>> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg", // non-standard but seen in the wild
	"image/webp": "webp",
	"image/gif": "gif",
};

/** Normalize a MIME string: strip parameters and lower-case. */
export function normalizeMime(mime: string): string {
	const semi = mime.indexOf(";");
	const base = semi >= 0 ? mime.slice(0, semi) : mime;
	return base.trim().toLowerCase();
}

/** True if the MIME type is a supported image type. */
export function isSupportedImageMime(mime: string): boolean {
	return Object.prototype.hasOwnProperty.call(
		SUPPORTED_IMAGE_MIME,
		normalizeMime(mime)
	);
}

/** Returns the canonical extension (no dot) for a supported MIME, else null. */
export function extensionForMime(mime: string): string | null {
	const normalized = normalizeMime(mime);
	return SUPPORTED_IMAGE_MIME[normalized] ?? null;
}

/** Human-readable list of supported types, for error messages. */
export function supportedMimeList(): string {
	return Object.keys(SUPPORTED_IMAGE_MIME)
		.filter((m) => m !== "image/jpg")
		.join(", ");
}
