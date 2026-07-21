/*
 * Shared types and default settings for the Evidence Paste plugin.
 *
 * This is an AI-free evidence logger: images pasted into a note are saved and
 * a structured evidence block is inserted for the user to fill in by hand.
 * There is no AI/vision analysis and no network access.
 */

export interface EvidencePasteSettings {
	/** Vault-relative folder where evidence images are stored. */
	attachmentFolder: string;
	/** Prefix for evidence numbers, e.g. "EV" -> "EV-001". */
	evidencePrefix: string;
	/** Minimum digit count for zero-padded evidence numbers. */
	evidenceNumberPadding: number;
	/** Max display width (px) applied to inserted images; 0 = no width. */
	imageMaxWidth: number;
	/** Insert a `### 증적 …` heading above the image. */
	insertHeading: boolean;
	/** Insert the description callout beneath the image. */
	insertCallout: boolean;
	/** Callout type keyword, e.g. "evidence". */
	calloutType: string;

	/** User-editable markdown template. Empty = built-in default. */
	markdownTemplate: string;
}

export const DEFAULT_SETTINGS: EvidencePasteSettings = {
	attachmentFolder: "attachments/evidence",
	evidencePrefix: "EV",
	evidenceNumberPadding: 3,
	imageMaxWidth: 0,
	insertHeading: true,
	insertCallout: true,
	calloutType: "evidence",

	markdownTemplate: "",
};
