/*
 * Short unique id generation, used for the {{placeholderId}} template variable.
 * Uses crypto.randomUUID when available (Electron/modern), with a safe fallback.
 */
export function generateId(): string {
	const c: unknown = (globalThis as { crypto?: unknown }).crypto;
	if (
		c &&
		typeof (c as { randomUUID?: unknown }).randomUUID === "function"
	) {
		return (c as { randomUUID: () => string }).randomUUID();
	}
	// Fallback: timestamp + random hex (uniqueness is best-effort here).
	const rand = Math.floor(Math.random() * 0xffffffff).toString(16);
	return `${Date.now().toString(16)}-${rand}`;
}
