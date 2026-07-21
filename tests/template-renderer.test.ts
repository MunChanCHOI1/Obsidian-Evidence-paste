import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildDefaultTemplate,
	buildImageEmbed,
	buildTemplateVars,
	renderEvidenceBlock,
	renderTemplate,
	type EvidenceRenderContext,
} from "../src/evidence/template-renderer";

function ctx(overrides: Partial<EvidenceRenderContext> = {}): EvidenceRenderContext {
	return {
		evidenceId: "EV-001",
		imagePath: "attachments/evidence/EV-001.png",
		imageName: "EV-001.png",
		imageMaxWidth: 0,
		timestamp: "2026-07-21 10:15:00",
		calloutType: "evidence",
		insertHeading: true,
		insertCallout: true,
		includeImage: true,
		customTemplate: "",
		placeholderId: "pid",
		pending: "직접 작성 필요",
		...overrides,
	};
}

test("buildImageEmbed formats with and without a width", () => {
	assert.equal(buildImageEmbed("a.png", 0), "![[a.png]]");
	assert.equal(buildImageEmbed("a.png", 480), "![[a.png|480]]");
	assert.equal(buildImageEmbed("a.png", -5), "![[a.png]]");
	assert.equal(buildImageEmbed("", 480), "");
});

test("buildDefaultTemplate composes parts from toggles", () => {
	const headingOnly = buildDefaultTemplate({ insertHeading: true, insertCallout: false, includeImage: false });
	assert.ok(headingOnly.includes("### 증적 {{evidenceId}}"));
	assert.ok(!headingOnly.includes("{{imageEmbed}}"));

	const all = buildDefaultTemplate({ insertHeading: true, insertCallout: true, includeImage: true });
	assert.ok(all.includes("### 증적 {{evidenceId}}"));
	assert.ok(all.includes("{{imageEmbed}}"));
	assert.ok(all.includes("> [!{{calloutType}}]+"));
});

test("buildDefaultTemplate never returns empty when all toggles are off", () => {
	const withImage = buildDefaultTemplate({ insertHeading: false, insertCallout: false, includeImage: true });
	assert.equal(withImage, "{{imageEmbed}}");
	const withoutImage = buildDefaultTemplate({ insertHeading: false, insertCallout: false, includeImage: false });
	assert.equal(withoutImage, "### 증적 {{evidenceId}}");
});

test("renderTemplate substitutes known keys and leaves unknown ones intact", () => {
	assert.equal(renderTemplate("id={{evidenceId}} x={{nope}}", { evidenceId: "EV-9" }), "id=EV-9 x={{nope}}");
});

test("renderTemplate re-prefixes continuation lines inside a callout", () => {
	const out = renderTemplate("> {{body}}", { body: "line1\nline2" });
	assert.equal(out, "> line1\n> line2");
});

test("buildTemplateVars fills AI-free defaults", () => {
	const vars = buildTemplateVars(ctx());
	assert.equal(vars.evidenceType, "스크린샷");
	assert.equal(vars.purpose, "직접 작성 필요");
	assert.equal(vars.action, "직접 작성 필요");
	assert.equal(vars.observation, "직접 작성 필요");
	assert.equal(vars.securityMeaning, "직접 작성 필요");
	assert.equal(vars.reproductionConditions, "직접 작성 필요");
	assert.equal(vars.title, "");
	assert.equal(vars.warnings, "");
	assert.equal(vars.imageEmbed, "![[attachments/evidence/EV-001.png]]");
});

test("buildTemplateVars falls back to 'evidence' for an empty callout type", () => {
	assert.equal(buildTemplateVars(ctx({ calloutType: "" })).calloutType, "evidence");
});

test("renderEvidenceBlock renders the full default block", () => {
	const block = renderEvidenceBlock(ctx({ imageMaxWidth: 480 }));
	assert.ok(block.includes("### 증적 EV-001"));
	assert.ok(block.includes("![[attachments/evidence/EV-001.png|480]]"));
	assert.ok(block.includes("> [!evidence]+ 증적 EV-001"));
	assert.ok(block.includes("> 스크린샷"));
	// Payload placeholder stays fenced AND inside the callout (each line prefixed).
	assert.ok(block.includes("> ```text\n> 직접 작성 필요\n> ```"));
	assert.ok(!block.includes("분석 중"));
});

test("renderEvidenceBlock omits the embed for the empty-template command", () => {
	const block = renderEvidenceBlock(ctx({ includeImage: false, imagePath: "", imageName: "" }));
	assert.ok(block.includes("### 증적 EV-001"));
	assert.ok(!block.includes("!["));
});

test("renderEvidenceBlock uses a non-empty custom template verbatim", () => {
	const block = renderEvidenceBlock(ctx({ customTemplate: "CUSTOM {{evidenceId}} @ {{timestamp}}" }));
	assert.equal(block, "CUSTOM EV-001 @ 2026-07-21 10:15:00");
});

test("renderEvidenceBlock falls back to default when the custom template is blank", () => {
	const block = renderEvidenceBlock(ctx({ customTemplate: "   \n  " }));
	assert.ok(block.includes("### 증적 EV-001"));
});
