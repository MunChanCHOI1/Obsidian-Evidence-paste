/*
 * Evidence-block template rendering. Pure functions (no Obsidian API) so they
 * are unit-testable in stage 8.
 *
 * The template renders the FULL evidence block (heading + image embed +
 * description callout). The default template is composed from the settings
 * toggles; a non-empty custom template overrides it entirely. If a custom
 * template fails to render, we fall back to the default so the plugin never
 * breaks on bad user input.
 *
 * Callout safety: every value substituted on a `> ...` line has its
 * continuation lines re-prefixed with the same `> ` prefix, so multi-line
 * values stay inside the callout. The payload is emitted as a length-safe
 * fenced code block, preserved verbatim.
 */

import { sanitizeScalar, toSafeFencedBlock } from "../utils/markdown";

export interface EvidenceRenderContext {
	evidenceId: string;
	/** Vault-relative image path; "" when there is no image. */
	imagePath: string;
	imageName: string;
	imageMaxWidth: number;
	/** Local timestamp for the {{timestamp}} variable. */
	timestamp: string;
	calloutType: string;
	insertHeading: boolean;
	insertCallout: boolean;
	/** false for the "insert empty template" command (no image embed). */
	includeImage: boolean;
	/** Non-empty -> use this instead of the default template. */
	customTemplate: string;
	placeholderId: string;
	/** Placeholder text for fields the user must fill in (e.g. "직접 작성 필요"). */
	pending: string;
}

const HEADING_PART = "### 증적 {{evidenceId}}";
const EMBED_PART = "{{imageEmbed}}";
const CALLOUT_PART = [
	"> [!{{calloutType}}]+ 증적 {{evidenceId}} — 설명 작성 필요",
	"> **증적 유형**",
	"> {{evidenceType}}",
	">",
	"> **확인 목적**",
	"> {{purpose}}",
	">",
	"> **수행 행위**",
	"> {{action}}",
	">",
	"> **입력값·페이로드**",
	"> {{payloadBlock}}",
	">",
	"> **관찰 결과**",
	"> {{observation}}",
	">",
	"> **보안적 의미**",
	"> {{securityMeaning}}",
	">",
	"> **재현 조건**",
	"> {{reproductionConditions}}",
].join("\n");

/** Build the `![[path]]` / `![[path|width]]` embed. */
export function buildImageEmbed(imagePath: string, imageMaxWidth: number): string {
	if (!imagePath) {
		return "";
	}
	const width = Number.isFinite(imageMaxWidth) && imageMaxWidth > 0 ? Math.floor(imageMaxWidth) : 0;
	return width > 0 ? `![[${imagePath}|${width}]]` : `![[${imagePath}]]`;
}

/** Compose the default template from the toggle settings. */
export function buildDefaultTemplate(opts: {
	insertHeading: boolean;
	insertCallout: boolean;
	includeImage: boolean;
}): string {
	const parts: string[] = [];
	if (opts.insertHeading) {
		parts.push(HEADING_PART);
	}
	if (opts.includeImage) {
		parts.push(EMBED_PART);
	}
	if (opts.insertCallout) {
		parts.push(CALLOUT_PART);
	}
	// Guarantee at least something meaningful.
	if (parts.length === 0) {
		parts.push(opts.includeImage ? EMBED_PART : HEADING_PART);
	}
	return parts.join("\n\n");
}

/** Compute the substitution variables for a render context. */
export function buildTemplateVars(ctx: EvidenceRenderContext): Record<string, string> {
	const pending = ctx.pending;

	// No AI analysis: every prose field is a placeholder the user fills in by
	// hand. `evidenceType` defaults to "스크린샷" since pastes are screenshots.
	// The payload placeholder is still emitted through the fence-safe helper so
	// a user who later types a real payload keeps the same block structure.
	const payload = pending;

	return {
		evidenceId: ctx.evidenceId,
		title: "",
		imagePath: ctx.imagePath,
		imageName: ctx.imageName,
		imageEmbed: buildImageEmbed(ctx.imagePath, ctx.imageMaxWidth),
		timestamp: ctx.timestamp,
		calloutType: ctx.calloutType || "evidence",
		evidenceType: "스크린샷",
		purpose: pending,
		action: pending,
		payload,
		payloadBlock: toSafeFencedBlock(payload, "text"),
		observation: pending,
		securityMeaning: pending,
		reproductionConditions: pending,
		warnings: "",
		placeholderId: ctx.placeholderId,
	};
}

/**
 * Substitute `{{key}}` placeholders. For a placeholder that sits on a line
 * whose prefix is only `>`/whitespace (a callout/indent line), continuation
 * lines of a multi-line value are re-prefixed with that same prefix.
 * Unknown keys are left untouched.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(
		/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
		(match: string, key: string, offset: number, full: string): string => {
			if (!Object.prototype.hasOwnProperty.call(vars, key)) {
				return match;
			}
			const value = vars[key] ?? "";
			const lineStart = full.lastIndexOf("\n", offset - 1) + 1;
			const linePrefix = full.slice(lineStart, offset);
			const contPrefix = /^[>\s]*$/.test(linePrefix) ? linePrefix : "";
			return value.replace(/\n/g, "\n" + contPrefix);
		}
	);
}

/**
 * Render the full evidence block. Uses the custom template when provided and
 * valid; otherwise the default. Falls back to the default on any error or an
 * empty result.
 */
export function renderEvidenceBlock(ctx: EvidenceRenderContext): string {
	const vars = buildTemplateVars(ctx);
	const custom = (ctx.customTemplate ?? "").trim();

	if (custom.length > 0) {
		try {
			const rendered = renderTemplate(custom, vars).trim();
			if (rendered.length > 0) {
				return rendered;
			}
		} catch {
			// fall through to default
		}
	}

	const defaultTemplate = buildDefaultTemplate({
		insertHeading: ctx.insertHeading,
		insertCallout: ctx.insertCallout,
		includeImage: ctx.includeImage,
	});
	return renderTemplate(defaultTemplate, vars).trim();
}

/* ------------------------------------------------------------------ *
 * 정찰 (recon) mode — a lighter, information-gathering block.
 *
 * Same visual family as the evidence callout but only three fields:
 *   대상 (target host/IP/URL), 도구·명령 (the command run), 발견 (what was found).
 * The command is emitted as a fence-safe code block; the two prose fields ride
 * on callout lines with continuation-line re-prefixing, exactly like evidence.
 * ------------------------------------------------------------------ */

/** Default callout keyword for recon blocks (built-in blue "info" style). */
export const RECON_CALLOUT_TYPE = "info";

export interface ReconRenderContext {
	reconId: string;
	imagePath: string;
	imageName: string;
	imageMaxWidth: number;
	insertHeading: boolean;
	includeImage: boolean;
	/** Callout keyword; empty -> RECON_CALLOUT_TYPE. */
	calloutType: string;
	/** 대상 (host / IP / URL). */
	target: string;
	/** 도구·명령 (the tool/command that was run). */
	command: string;
	/** 발견 (open ports / services / subdomains / notes). */
	finding: string;
	/** Placeholder used for any field left blank (e.g. "직접 작성 필요"). */
	pending: string;
	placeholderId: string;
}

const RECON_HEADING_PART = "### 정찰 {{reconId}}";
const RECON_CALLOUT_PART = [
	"> [!{{calloutType}}]+ 정찰 {{reconId}}",
	"> **대상**",
	"> {{target}}",
	">",
	"> **도구·명령**",
	"> {{commandBlock}}",
	">",
	"> **발견**",
	"> {{finding}}",
].join("\n");

/** Substitution variables for a recon block. Blank fields fall back to `pending`. */
export function buildReconVars(ctx: ReconRenderContext): Record<string, string> {
	const target = sanitizeScalar(ctx.target) || ctx.pending;
	const finding = sanitizeScalar(ctx.finding) || ctx.pending;
	// Keep the command verbatim (payload-like); fence-safe wrap it.
	const commandRaw = (ctx.command ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
	const command = commandRaw.length > 0 ? commandRaw : ctx.pending;

	return {
		reconId: ctx.reconId,
		calloutType: ctx.calloutType || RECON_CALLOUT_TYPE,
		imageEmbed: buildImageEmbed(ctx.imagePath, ctx.imageMaxWidth),
		imagePath: ctx.imagePath,
		imageName: ctx.imageName,
		target,
		command,
		commandBlock: toSafeFencedBlock(command, "text"),
		finding,
		placeholderId: ctx.placeholderId,
	};
}

/** Render the full recon block (optional heading + embed + light callout). */
export function renderReconBlock(ctx: ReconRenderContext): string {
	const vars = buildReconVars(ctx);
	const parts: string[] = [];
	if (ctx.insertHeading) {
		parts.push(RECON_HEADING_PART);
	}
	if (ctx.includeImage) {
		parts.push(EMBED_PART);
	}
	parts.push(RECON_CALLOUT_PART);
	return renderTemplate(parts.join("\n\n"), vars).trim();
}

/* ------------------------------------------------------------------ *
 * 페이로드 (payload) mode — capture a TEXT paste verbatim.
 *
 * Unlike the other modes there is no image: the clipboard text (an HTTP
 * request/response, an injection string, tool output) is wrapped in a
 * fence-safe code block inside a callout, alongside optional 대상 / 설명 prose.
 * The fence language is chosen from a light HTTP sniff so Burp captures get
 * syntax highlighting.
 * ------------------------------------------------------------------ */

/** Default callout keyword for payload blocks. */
export const PAYLOAD_CALLOUT_TYPE = "payload";

export type PayloadKind = "http-request" | "http-response" | "text";

/** Korean label for a payload kind, used in the callout title. */
export function payloadKindLabel(kind: PayloadKind): string {
	switch (kind) {
		case "http-request":
			return "HTTP 요청";
		case "http-response":
			return "HTTP 응답";
		default:
			return "텍스트";
	}
}

/**
 * Sniff whether a pasted blob looks like an HTTP request or response by its
 * first non-blank line. Deliberately conservative: anything unrecognized is
 * plain "text" so nothing is mislabeled.
 */
export function detectPayloadKind(text: string): PayloadKind {
	const firstLine = (text ?? "")
		.replace(/^\s+/, "")
		.split(/\r?\n/, 1)[0] ?? "";
	if (/^HTTP\/\d(?:\.\d)?\s+\d{3}\b/.test(firstLine)) {
		return "http-response";
	}
	if (/^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s+\S+\s+HTTP\/\d/.test(firstLine)) {
		return "http-request";
	}
	return "text";
}

export interface PayloadRenderContext {
	payloadId: string;
	insertHeading: boolean;
	/** Callout keyword; empty -> PAYLOAD_CALLOUT_TYPE. */
	calloutType: string;
	/** 대상 (host / IP / URL / endpoint); blank -> pending. */
	target: string;
	/** 설명·맥락 (why this payload matters); blank -> pending. */
	label: string;
	/** The raw pasted text, preserved verbatim in a fence-safe block. */
	payloadText: string;
	/** Detected kind; picks the fence language and title suffix. */
	kind: PayloadKind;
	/** Local capture timestamp (YYYY-MM-DD HH:mm:ss). */
	timestamp: string;
	/** Placeholder for blank fields. */
	pending: string;
	placeholderId: string;
}

const PAYLOAD_HEADING_PART = "### 페이로드 {{payloadId}}";
const PAYLOAD_CALLOUT_PART = [
	"> [!{{calloutType}}]+ 페이로드 {{payloadId}} — {{kindLabel}}",
	"> **대상**",
	"> {{target}}",
	">",
	"> **설명·맥락**",
	"> {{label}}",
	">",
	"> **캡처 시각**",
	"> {{timestamp}}",
	">",
	"> **원문**",
	"> {{payloadBlock}}",
].join("\n");

/** Substitution variables for a payload block. Blank prose falls back to pending. */
export function buildPayloadVars(ctx: PayloadRenderContext): Record<string, string> {
	const target = sanitizeScalar(ctx.target) || ctx.pending;
	const label = sanitizeScalar(ctx.label) || ctx.pending;
	// Keep the payload verbatim; only normalize line endings before fencing.
	const raw = (ctx.payloadText ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
	const lang = ctx.kind === "text" ? "text" : "http";
	return {
		payloadId: ctx.payloadId,
		calloutType: ctx.calloutType || PAYLOAD_CALLOUT_TYPE,
		kindLabel: payloadKindLabel(ctx.kind),
		target,
		label,
		timestamp: ctx.timestamp,
		payloadBlock: toSafeFencedBlock(raw, lang),
		placeholderId: ctx.placeholderId,
	};
}

/** Render the full payload block (optional heading + callout, no image). */
export function renderPayloadBlock(ctx: PayloadRenderContext): string {
	const vars = buildPayloadVars(ctx);
	const parts: string[] = [];
	if (ctx.insertHeading) {
		parts.push(PAYLOAD_HEADING_PART);
	}
	parts.push(PAYLOAD_CALLOUT_PART);
	return renderTemplate(parts.join("\n\n"), vars).trim();
}

/* ------------------------------------------------------------------ *
 * 기본 (basic) mode — just the image plus an optional one-line caption.
 * No numbering, no callout. The caption renders italicized under the embed.
 * ------------------------------------------------------------------ */

export interface BasicRenderContext {
	imagePath: string;
	imageName: string;
	imageMaxWidth: number;
	includeImage: boolean;
	/** Optional caption; blank -> caption line omitted. */
	caption: string;
}

/** Render a basic image block: embed + optional `*caption*`. */
export function renderBasicBlock(ctx: BasicRenderContext): string {
	const embed = ctx.includeImage ? buildImageEmbed(ctx.imagePath, ctx.imageMaxWidth) : "";
	const caption = sanitizeScalar(ctx.caption);
	const parts: string[] = [];
	if (embed.length > 0) {
		parts.push(embed);
	}
	if (caption.length > 0) {
		parts.push(`*${caption}*`);
	}
	if (parts.length === 0) {
		parts.push(embed);
	}
	return parts.join("\n");
}
