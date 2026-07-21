import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Notice,
	TFile,
	normalizePath,
} from "obsidian";
import type EvidencePastePlugin from "../main";
import { EvidencePasteError, errorMessage, logError, logInfo } from "../utils/errors";
import {
	extensionForMime,
	isSupportedImageMime,
	supportedMimeList,
} from "../utils/mime";
import {
	buildImageFileName,
	formatTimestamp,
	formatDisplayTimestamp,
	resolveUniquePath,
} from "../evidence/file-naming";
import {
	RECON_CALLOUT_TYPE,
	detectPayloadKind,
	renderBasicBlock,
	renderEvidenceBlock,
	renderPayloadBlock,
	renderReconBlock,
} from "../evidence/template-renderer";
import { generateId } from "../utils/id";
import {
	ExtractedImage,
	describeClipboard,
	extractImagesFromClipboard,
} from "./clipboard-image";
import { insertBlockAtCursor } from "./evidence-inserter";
import { promptFields } from "../ui/mode-input-modal";
import { redactImage } from "../ui/redaction-modal";

/** Bytes ready to persist: either the original image or a redacted PNG. */
interface ImageBytes {
	buffer: ArrayBuffer;
	mime: string;
}

const PENDING = "직접 작성 필요";

interface SavedImage {
	targetPath: string;
	imageName: string;
	now: Date;
}

/*
 * Orchestrates the paste -> save -> insert flow.
 *
 * Behaves like a browser extension:
 *   - The MASTER switch (settings.enabled) decides whether image pastes are
 *     intercepted at all. When off, we never call preventDefault(): Obsidian's
 *     native paste runs untouched.
 *   - The ACTIVE MODE decides what gets inserted:
 *       · evidence(증적): full structured callout (unchanged spec).
 *       · recon(정찰):   light callout (대상 / 도구·명령 / 발견) from a paste-time modal.
 *       · basic(기본):    image embed + optional one-line caption from a paste-time modal.
 *
 * Data-safety principle: we only call preventDefault() AFTER confirming the
 * clipboard actually contains image data. Plain-text pastes return early.
 * For the modal modes, the image is written to disk only after the user
 * confirms the modal, so cancelling leaves nothing behind.
 */
export class PasteHandler {
	constructor(private readonly plugin: EvidencePastePlugin) {}

	/** Synchronous entry point registered on the `editor-paste` event. */
	handleEditorPaste(
		evt: ClipboardEvent,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo
	): void {
		// Master switch off -> do not interfere with any paste at all.
		if (!this.plugin.settings.enabled) {
			return;
		}

		// Extract synchronously; clipboard data is not usable after this returns.
		const images = extractImagesFromClipboard(evt.clipboardData);

		// Payload mode is the one text-first mode: capture a text paste (an HTTP
		// request/response, an injection string, tool output). Read the text
		// synchronously too, before the event's clipboardData goes stale.
		if (this.plugin.settings.activeMode === "payload") {
			const text = evt.clipboardData?.getData("text/plain") ?? "";
			if (text.trim().length > 0) {
				evt.preventDefault();
				void this.processPayload(text, editor).catch((err) => {
					logError("payload paste failed", err);
					new Notice(`붙여넣기 실패: ${errorMessage(err)}`);
				});
				return;
			}
			// No text but an image was pasted -> preserve it as a basic embed
			// rather than dropping it; otherwise fall through to the default.
			if (images.length === 0) {
				return;
			}
		}

		logInfo(
			`paste -> ${describeClipboard(evt.clipboardData)} => ${images.length} image(s)`
		);

		if (images.length === 0) {
			// No image -> do not interfere with the default (text) paste.
			return;
		}

		// We have image data in hand; now it is safe to take over the paste.
		evt.preventDefault();

		void this.processImages(images, editor, info).catch((err) => {
			logError("paste processing failed", err);
			new Notice(`붙여넣기 실패: ${errorMessage(err)}`);
		});
	}

	/** Validate, then dispatch to the active mode's pipeline. */
	private async processImages(
		images: ExtractedImage[],
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo
	): Promise<void> {
		const file = info.file ?? this.plugin.app.workspace.getActiveFile();
		if (!file) {
			throw new EvidencePasteError("활성 Markdown 파일이 없습니다.");
		}

		// Per-project image folder: ensure a project is chosen before saving.
		if (this.plugin.settings.currentProject.trim().length === 0) {
			const project = await this.plugin.ensureProject();
			if (project === null) {
				new Notice("프로젝트가 지정되지 않아 붙여넣기를 취소했습니다.");
				return;
			}
		}

		const supported = images.filter((img) => isSupportedImageMime(img.mime));
		const unsupportedCount = images.length - supported.length;

		if (supported.length === 0) {
			new Notice(
				`지원하지 않는 이미지 형식입니다. 지원 형식: ${supportedMimeList()}`
			);
			return;
		}

		switch (this.plugin.settings.activeMode) {
			case "recon":
				await this.processRecon(supported, unsupportedCount, editor);
				return;
			case "basic":
			// Payload mode is text-first; an image pasted while it is active is
			// preserved as a basic embed rather than being dropped.
			case "payload":
				await this.processBasic(supported, unsupportedCount, editor);
				return;
			case "evidence":
			default:
				await this.processEvidence(supported, unsupportedCount, editor);
				return;
		}
	}

	/* ---------------- 증적 (evidence) — unchanged spec ---------------- */
	private async processEvidence(
		supported: ExtractedImage[],
		unsupportedCount: number,
		editor: Editor
	): Promise<void> {
		const settings = this.plugin.settings;
		await this.ensureImageFolder();

		const ids = await this.plugin.allocateIds(
			editor.getValue(),
			settings.evidencePrefix,
			supported.length
		);

		let savedCount = 0;
		for (let i = 0; i < supported.length; i++) {
			const bytes = await this.resolveImageBytes(supported[i]);
			if (!bytes) {
				continue; // user skipped this image in the redaction editor
			}
			const saved = await this.saveImage(bytes, ids[i]);
			if (!saved) {
				continue;
			}
			const markdown = renderEvidenceBlock({
				evidenceId: ids[i],
				imagePath: saved.targetPath,
				imageName: saved.imageName,
				imageMaxWidth: settings.imageMaxWidth,
				timestamp: formatDisplayTimestamp(saved.now),
				calloutType: settings.calloutType,
				insertHeading: settings.insertHeading,
				insertCallout: settings.insertCallout,
				includeImage: true,
				customTemplate: settings.markdownTemplate,
				placeholderId: generateId(),
				pending: PENDING,
			});
			insertBlockAtCursor(editor, markdown);
			savedCount++;
			new Notice(`${ids[i]} 이미지 저장 완료`);
		}

		this.reportUnsupported(savedCount, unsupportedCount);
	}

	/* ---------------- 정찰 (recon) — light, modal-driven ---------------- */
	private async processRecon(
		supported: ExtractedImage[],
		unsupportedCount: number,
		editor: Editor
	): Promise<void> {
		const settings = this.plugin.settings;

		const input = await promptFields(this.plugin.app, {
			title: "정찰 기록",
			submitText: "삽입",
			fields: [
				{ key: "target", label: "대상", value: settings.lastReconTarget, placeholder: "host / IP / URL (예: 10.0.0.5, target.local)" },
				{ key: "command", label: "도구·명령", placeholder: "실행한 명령 한 줄 (예: nmap -sV 10.0.0.5)" },
				{ key: "finding", label: "발견", placeholder: "열린 포트 / 서비스 / 서브도메인 등", multiline: true },
			],
		});
		if (input === null) {
			new Notice("정찰 붙여넣기 취소됨");
			return;
		}

		// Remember 대상 so it pre-fills as the default next time (still editable).
		const target = input.target.trim();
		if (target.length > 0 && target !== settings.lastReconTarget) {
			settings.lastReconTarget = target;
			await this.plugin.saveSettings();
		}

		await this.ensureImageFolder();
		const ids = await this.plugin.allocateIds(
			editor.getValue(),
			settings.reconPrefix,
			supported.length
		);

		let savedCount = 0;
		for (let i = 0; i < supported.length; i++) {
			const bytes = await this.resolveImageBytes(supported[i]);
			if (!bytes) {
				continue; // user skipped this image in the redaction editor
			}
			const saved = await this.saveImage(bytes, ids[i]);
			if (!saved) {
				continue;
			}
			const markdown = renderReconBlock({
				reconId: ids[i],
				imagePath: saved.targetPath,
				imageName: saved.imageName,
				imageMaxWidth: settings.imageMaxWidth,
				insertHeading: settings.reconInsertHeading,
				includeImage: true,
				calloutType: RECON_CALLOUT_TYPE,
				target: input.target,
				command: input.command,
				finding: input.finding,
				pending: PENDING,
				placeholderId: generateId(),
			});
			insertBlockAtCursor(editor, markdown);
			savedCount++;
			new Notice(`${ids[i]} 정찰 기록 저장 완료`);
		}

		this.reportUnsupported(savedCount, unsupportedCount);
	}

	/* ---------------- 기본 (basic) — image + caption ---------------- */
	private async processBasic(
		supported: ExtractedImage[],
		unsupportedCount: number,
		editor: Editor
	): Promise<void> {
		const settings = this.plugin.settings;

		const input = await promptFields(this.plugin.app, {
			title: "이미지 붙여넣기",
			submitText: "삽입",
			fields: [
				{ key: "caption", label: "캡션", placeholder: "이미지 설명 (비워두면 캡션 없음)" },
			],
		});
		if (input === null) {
			new Notice("이미지 붙여넣기 취소됨");
			return;
		}

		await this.ensureImageFolder();

		let savedCount = 0;
		for (let i = 0; i < supported.length; i++) {
			const bytes = await this.resolveImageBytes(supported[i]);
			if (!bytes) {
				continue; // user skipped this image in the redaction editor
			}
			const saved = await this.saveImage(bytes, "IMG");
			if (!saved) {
				continue;
			}
			const markdown = renderBasicBlock({
				imagePath: saved.targetPath,
				imageName: saved.imageName,
				imageMaxWidth: settings.imageMaxWidth,
				includeImage: true,
				caption: input.caption,
			});
			insertBlockAtCursor(editor, markdown);
			savedCount++;
		}
		new Notice(`이미지 ${savedCount}개 붙여넣기 완료`);

		this.reportUnsupported(savedCount, unsupportedCount);
	}

	/* ---------------- 페이로드 (payload) — text-first, no image ---------------- */
	private async processPayload(text: string, editor: Editor): Promise<void> {
		const settings = this.plugin.settings;

		// Keep numbering project-scoped even though nothing is written to disk.
		if (settings.currentProject.trim().length === 0) {
			const project = await this.plugin.ensureProject();
			if (project === null) {
				new Notice("프로젝트가 지정되지 않아 붙여넣기를 취소했습니다.");
				return;
			}
		}

		const kind = detectPayloadKind(text);
		const input = await promptFields(this.plugin.app, {
			title: "페이로드 기록",
			submitText: "삽입",
			fields: [
				{ key: "target", label: "대상", value: settings.lastReconTarget, placeholder: "host / IP / URL / 엔드포인트" },
				{ key: "label", label: "설명·맥락", placeholder: "이 페이로드의 목적/결과 (선택)", multiline: true },
			],
		});
		if (input === null) {
			new Notice("페이로드 붙여넣기 취소됨");
			return;
		}

		// Remember 대상 so it pre-fills next time (shared with recon mode).
		const target = input.target.trim();
		if (target.length > 0 && target !== settings.lastReconTarget) {
			settings.lastReconTarget = target;
			await this.plugin.saveSettings();
		}

		const [payloadId] = await this.plugin.allocateIds(
			editor.getValue(),
			settings.payloadPrefix,
			1
		);
		const markdown = renderPayloadBlock({
			payloadId,
			insertHeading: settings.payloadInsertHeading,
			calloutType: settings.payloadCalloutType,
			target: input.target,
			label: input.label,
			payloadText: text,
			kind,
			timestamp: formatDisplayTimestamp(new Date()),
			pending: PENDING,
			placeholderId: generateId(),
		});
		insertBlockAtCursor(editor, markdown);
		new Notice(`${payloadId} 페이로드 기록 완료`);
	}

	/* ---------------- shared helpers ---------------- */

	/**
	 * Turn a pasted image into the bytes to persist. With redaction enabled the
	 * user first blacks out secrets/PII in an editor; returns null when they
	 * cancel that editor, so the caller skips the image entirely. Without
	 * redaction the original bytes pass through unchanged.
	 */
	private async resolveImageBytes(image: ExtractedImage): Promise<ImageBytes | null> {
		if (!this.plugin.settings.redactOnPaste) {
			return { buffer: await image.file.arrayBuffer(), mime: image.mime };
		}
		return redactImage(this.plugin.app, image.file);
	}

	/** Create the current project's image folder (public; used by the plugin). */
	async ensureImageFolder(): Promise<void> {
		await this.ensureFolder(this.plugin.imageFolder());
	}

	/**
	 * Save resolved image bytes to the attachment folder under a unique
	 * `<baseId>_<timestamp>.<ext>` name. Returns null if the MIME has no
	 * known extension (already filtered upstream, but kept defensive).
	 */
	private async saveImage(
		bytes: ImageBytes,
		baseId: string
	): Promise<SavedImage | null> {
		const ext = extensionForMime(bytes.mime);
		if (!ext) {
			return null;
		}
		const now = new Date();
		const fileName = buildImageFileName(baseId, formatTimestamp(now), ext);
		const targetPath = await resolveUniquePath(
			this.plugin.imageFolder(),
			fileName,
			(p) => this.plugin.app.vault.adapter.exists(normalizePath(p))
		);
		await this.plugin.app.vault.createBinary(normalizePath(targetPath), bytes.buffer);
		const imageName = targetPath.slice(targetPath.lastIndexOf("/") + 1);
		return { targetPath, imageName, now };
	}

	private reportUnsupported(savedCount: number, unsupportedCount: number): void {
		if (unsupportedCount > 0) {
			new Notice(
				`이미지 ${savedCount}개 저장, 지원하지 않는 형식 ${unsupportedCount}개는 건너뜀`
			);
		}
	}

	/**
	 * Ensure `folder` exists, creating each path segment as needed.
	 * Tolerates races where another process created the folder first.
	 */
	private async ensureFolder(folder: string): Promise<void> {
		const normalized = normalizePath(folder);
		if (normalized === "" || normalized === "/" || normalized === ".") {
			return; // vault root
		}

		const vault = this.plugin.app.vault;
		const segments = normalized.split("/").filter((s) => s.length > 0);
		let current = "";
		for (const segment of segments) {
			current = current.length > 0 ? `${current}/${segment}` : segment;
			const existing = vault.getAbstractFileByPath(current);
			if (existing) {
				continue;
			}
			try {
				await vault.createFolder(current);
			} catch (err) {
				// If it now exists, the failure was a benign race; else rethrow.
				if (!vault.getAbstractFileByPath(current)) {
					throw new EvidencePasteError(
						`첨부 폴더 생성 실패: ${current} (${errorMessage(err)})`
					);
				}
			}
		}
	}

	/**
	 * Resolve the active file for a given editor/info.
	 */
	resolveActiveFile(info?: MarkdownView | MarkdownFileInfo): TFile | null {
		return info?.file ?? this.plugin.app.workspace.getActiveFile();
	}
}
