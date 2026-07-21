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

import { toSafeFencedBlock } from "../utils/markdown";

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
