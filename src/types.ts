/*
 * Shared types and default settings for the Evidence Paste plugin.
 *
 * This is an AI-free evidence logger: images pasted into a note are saved and
 * a structured block is inserted for the user to fill in by hand. There is no
 * AI/vision analysis and no network access.
 *
 * The plugin behaves like a browser extension: a master ON/OFF switch decides
 * whether image pastes are intercepted at all, and an "active mode" decides
 * WHAT gets inserted when they are:
 *   - "evidence" (증적): the full structured evidence callout (7 fields).
 *   - "recon"    (정찰): a light callout (대상 / 도구·명령 / 발견).
 *   - "basic"    (기본): just the image embed plus a one-line caption.
 *   - "payload"  (페이로드): capture a TEXT paste (HTTP request/response, an
 *     injection string, tool output) into a fence-safe callout. This is the one
 *     mode that intercepts text rather than images.
 */

/** Which paste behavior is active. Mirrors the UI modes. */
export type PasteMode = "recon" | "evidence" | "basic" | "payload";

export const PASTE_MODES: PasteMode[] = ["recon", "evidence", "basic", "payload"];

/** Human-facing Korean labels for each mode (menus, status bar, notices). */
export const MODE_LABELS: Record<PasteMode, string> = {
	recon: "정찰",
	evidence: "증적",
	basic: "기본",
	payload: "페이로드",
};

export interface EvidencePasteSettings {
	// ---- 동작 (browser-extension style) ----
	/** Master switch. When false, pastes are NOT intercepted at all. Default OFF. */
	enabled: boolean;
	/** Active paste mode. Decides which block gets inserted. */
	activeMode: PasteMode;

	// ---- 프로젝트 ----
	/**
	 * Current project name. Images are stored in a per-project subfolder of the
	 * attachment folder. Empty means "not chosen yet" — the plugin prompts for
	 * it the first time it is turned on (or on the first paste).
	 */
	currentProject: string;

	/**
	 * Per-project, per-prefix "last used number" counters, so evidence/recon/
	 * payload ids stay UNIQUE ACROSS every note in the project (not just within
	 * the current note). Keyed by `counterKey(project, prefix)`. The next id is
	 * always max(counter, numbers already present in the note) + 1, so hand-
	 * edited notes and pre-existing ids are never clobbered.
	 */
	projectCounters: Record<string, number>;

	// ---- 파일/폴더 ----
	/** Vault-relative BASE folder; the active project becomes a subfolder of it. */
	attachmentFolder: string;

	// ---- 증적(evidence) 번호 ----
	/** Prefix for evidence numbers, e.g. "EV" -> "EV-001". */
	evidencePrefix: string;
	/** Minimum digit count for zero-padded evidence numbers. */
	evidenceNumberPadding: number;

	// ---- 정찰(recon) 번호 ----
	/** Prefix for recon numbers, e.g. "RC" -> "RC-001". */
	reconPrefix: string;
	/** Insert a `### 정찰 RC-00X` heading above the recon image. */
	reconInsertHeading: boolean;
	/** Last-used recon 대상; pre-filled as the default next time (editable). */
	lastReconTarget: string;

	// ---- 페이로드(payload) 모드 ----
	/** Prefix for payload numbers, e.g. "PL" -> "PL-001". */
	payloadPrefix: string;
	/** Callout type keyword for payload blocks, e.g. "payload" -> [!payload]. */
	payloadCalloutType: string;
	/** Insert a `### 페이로드 PL-00X` heading above the payload callout. */
	payloadInsertHeading: boolean;

	// ---- 이미지 마스킹(레디렉션) ----
	/**
	 * When true, every pasted image opens a redaction editor first, so secrets/
	 * PII can be blacked out BEFORE the file is written to the vault. Redacted
	 * images are re-encoded as PNG (webp/gif lose animation).
	 */
	redactOnPaste: boolean;

	// ---- 이미지 표시 ----
	/** Max display width (px) applied to inserted images; 0 = no width. */
	imageMaxWidth: number;

	// ---- 증적 서식 ----
	/** Insert a `### 증적 …` heading above the image. */
	insertHeading: boolean;
	/** Insert the description callout beneath the image. */
	insertCallout: boolean;
	/** Callout type keyword, e.g. "evidence". */
	calloutType: string;

	/** User-editable markdown template (evidence mode). Empty = built-in default. */
	markdownTemplate: string;
}

export const DEFAULT_SETTINGS: EvidencePasteSettings = {
	enabled: false,
	activeMode: "evidence",

	currentProject: "",
	projectCounters: {},

	attachmentFolder: "attachments/evidence",

	evidencePrefix: "EV",
	evidenceNumberPadding: 3,

	reconPrefix: "RC",
	reconInsertHeading: true,
	lastReconTarget: "",

	payloadPrefix: "PL",
	payloadCalloutType: "payload",
	payloadInsertHeading: true,

	redactOnPaste: false,

	imageMaxWidth: 0,

	insertHeading: true,
	insertCallout: true,
	calloutType: "evidence",

	markdownTemplate: "",
};
