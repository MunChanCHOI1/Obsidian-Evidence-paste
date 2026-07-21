import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildPayloadVars,
	detectPayloadKind,
	payloadKindLabel,
	renderPayloadBlock,
	type PayloadRenderContext,
} from "../src/evidence/template-renderer";

function ctx(overrides: Partial<PayloadRenderContext> = {}): PayloadRenderContext {
	return {
		payloadId: "PL-001",
		insertHeading: true,
		calloutType: "payload",
		target: "https://target.local/login",
		label: "로그인 우회 시도",
		payloadText: "GET /admin HTTP/1.1\nHost: target.local",
		kind: "http-request",
		timestamp: "2026-07-21 10:15:00",
		pending: "직접 작성 필요",
		placeholderId: "pid",
		...overrides,
	};
}

test("detectPayloadKind recognizes an HTTP request line", () => {
	assert.equal(detectPayloadKind("GET /a HTTP/1.1\nHost: x"), "http-request");
	assert.equal(detectPayloadKind("POST /login HTTP/2\n"), "http-request");
});

test("detectPayloadKind recognizes an HTTP response status line", () => {
	assert.equal(detectPayloadKind("HTTP/1.1 200 OK\nServer: nginx"), "http-response");
	assert.equal(detectPayloadKind("HTTP/2 404 Not Found"), "http-response");
});

test("detectPayloadKind ignores leading blank lines", () => {
	assert.equal(detectPayloadKind("\n\n  GET / HTTP/1.1"), "http-request");
});

test("detectPayloadKind falls back to text for anything else", () => {
	assert.equal(detectPayloadKind("' OR 1=1 --"), "text");
	assert.equal(detectPayloadKind("just a note"), "text");
	assert.equal(detectPayloadKind("GETTING started HTTP is great"), "text");
});

test("payloadKindLabel maps kinds to Korean labels", () => {
	assert.equal(payloadKindLabel("http-request"), "HTTP 요청");
	assert.equal(payloadKindLabel("http-response"), "HTTP 응답");
	assert.equal(payloadKindLabel("text"), "텍스트");
});

test("buildPayloadVars fences the payload with the http language for HTTP kinds", () => {
	const vars = buildPayloadVars(ctx());
	assert.ok(vars.payloadBlock.startsWith("```http\n"));
	assert.ok(vars.payloadBlock.includes("GET /admin HTTP/1.1"));
});

test("buildPayloadVars uses the text language for plain payloads", () => {
	const vars = buildPayloadVars(ctx({ kind: "text", payloadText: "' OR 1=1 --" }));
	assert.ok(vars.payloadBlock.startsWith("```text\n"));
});

test("buildPayloadVars falls back to pending for blank prose fields", () => {
	const vars = buildPayloadVars(ctx({ target: "", label: "" }));
	assert.equal(vars.target, "직접 작성 필요");
	assert.equal(vars.label, "직접 작성 필요");
});

test("buildPayloadVars keeps a payload with embedded backticks intact via a longer fence", () => {
	const vars = buildPayloadVars(ctx({ kind: "text", payloadText: "a ``` b" }));
	assert.ok(vars.payloadBlock.startsWith("````text\n"));
	assert.ok(vars.payloadBlock.includes("a ``` b"));
});

test("renderPayloadBlock includes heading, callout title and code fence", () => {
	const md = renderPayloadBlock(ctx());
	assert.ok(md.includes("### 페이로드 PL-001"));
	assert.ok(md.includes("> [!payload]+ 페이로드 PL-001 — HTTP 요청"));
	// The fenced payload rides inside the callout: continuation lines re-prefixed.
	assert.ok(md.includes("> ```http"));
	assert.ok(md.includes("> GET /admin HTTP/1.1"));
});

test("renderPayloadBlock omits the heading when disabled", () => {
	const md = renderPayloadBlock(ctx({ insertHeading: false }));
	assert.ok(!md.includes("### 페이로드"));
	assert.ok(md.startsWith("> [!payload]+"));
});

test("renderPayloadBlock defaults a blank callout type to payload", () => {
	const md = renderPayloadBlock(ctx({ calloutType: "" }));
	assert.ok(md.includes("> [!payload]+"));
});
