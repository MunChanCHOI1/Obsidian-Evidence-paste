/*
 * Error helpers and safe logging.
 *
 * IMPORTANT: never log image binary, auth headers, API keys, or full
 * sensitive values. These helpers only ever log short human messages.
 */

const LOG_PREFIX = "[Evidence Paste]";

/** Domain error type so we can distinguish expected, user-facing failures. */
export class EvidencePasteError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EvidencePasteError";
	}
}

/** Extract a short, safe message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	if (typeof err === "string") {
		return err;
	}
	try {
		return String(err);
	} catch {
		return "unknown error";
	}
}

/** Log a developer-facing error to the console WITHOUT sensitive data. */
export function logError(context: string, err: unknown): void {
	console.error(`${LOG_PREFIX} ${context}: ${errorMessage(err)}`);
}

/** Log a developer-facing debug line. */
export function logDebug(message: string): void {
	console.debug(`${LOG_PREFIX} ${message}`);
}

/** Log a developer-facing info line (visible at default console level). */
export function logInfo(message: string): void {
	console.log(`${LOG_PREFIX} ${message}`);
}
