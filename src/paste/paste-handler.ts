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
import { nextEvidenceIds } from "../evidence/evidence-id";
import {
	buildImageFileName,
	formatTimestamp,
	formatDisplayTimestamp,
	resolveUniquePath,
} from "../evidence/file-naming";
import { renderEvidenceBlock } from "../evidence/template-renderer";
import { generateId } from "../utils/id";
import {
	ExtractedImage,
	describeClipboard,
	extractImagesFromClipboard,
} from "./clipboard-image";
import { insertBlockAtCursor } from "./evidence-inserter";

/*
 * Orchestrates the paste -> save -> insert flow.
 *
 * Detect an image paste, save the image binary to the attachment folder with
 * an evidence-numbered file name, and insert the rendered evidence block
 * (heading + embed + description callout) at the cursor. There is no AI: the
 * callout fields are inserted as "직접 작성 필요" placeholders for the user to fill.
 *
 * Data-safety principle: we only call preventDefault() AFTER we have confirmed
 * that the clipboard actually contains image data (File objects already
 * extracted and held in memory). A plain-text paste returns early and lets
 * Obsidian handle it normally.
 */
export class PasteHandler {
	constructor(private readonly plugin: EvidencePastePlugin) {}

	/** Synchronous entry point registered on the `editor-paste` event. */
	handleEditorPaste(
		evt: ClipboardEvent,
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo
	): void {
		// Extract synchronously; clipboard data is not usable after this returns.
		const images = extractImagesFromClipboard(evt.clipboardData);

		// Diagnostic: one line per paste. If this prints TWICE for a single
		// paste, the event handler is registered more than once (duplicate
		// plugin load). If it prints once but shows >1 image for a single
		// screenshot, the clipboard exposed multiple renditions.
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
			new Notice(`증적 붙여넣기 실패: ${errorMessage(err)}`);
		});
	}

	/** Async pipeline: validate, save each image, insert markdown. */
	private async processImages(
		images: ExtractedImage[],
		editor: Editor,
		info: MarkdownView | MarkdownFileInfo
	): Promise<void> {
		const settings = this.plugin.settings;

		const file = info.file ?? this.plugin.app.workspace.getActiveFile();
		if (!file) {
			throw new EvidencePasteError("활성 Markdown 파일이 없습니다.");
		}

		const supported = images.filter((img) => isSupportedImageMime(img.mime));
		const unsupportedCount = images.length - supported.length;

		if (supported.length === 0) {
			new Notice(
				`지원하지 않는 이미지 형식입니다. 지원 형식: ${supportedMimeList()}`
			);
			return;
		}

		await this.ensureFolder(settings.attachmentFolder);

		// Compute all evidence ids up front so multi-image pastes get a clean
		// sequential run even though each insert mutates the note.
		const content = editor.getValue();
		const ids = nextEvidenceIds(
			content,
			settings.evidencePrefix,
			settings.evidenceNumberPadding,
			supported.length
		);

		let savedCount = 0;
		for (let i = 0; i < supported.length; i++) {
			const image = supported[i];
			const evidenceId = ids[i];
			const ext = extensionForMime(image.mime);
			if (!ext) {
				// Should not happen (already filtered), but stay defensive.
				continue;
			}

			const buffer = await image.file.arrayBuffer();
			const now = new Date();
			const timestamp = formatTimestamp(now);
			const fileName = buildImageFileName(evidenceId, timestamp, ext);
			const targetPath = await resolveUniquePath(
				settings.attachmentFolder,
				fileName,
				(p) => this.plugin.app.vault.adapter.exists(normalizePath(p))
			);

			await this.plugin.app.vault.createBinary(
				normalizePath(targetPath),
				buffer
			);

			const imageName = targetPath.slice(targetPath.lastIndexOf("/") + 1);
			const markdown = renderEvidenceBlock({
				evidenceId,
				imagePath: targetPath,
				imageName,
				imageMaxWidth: settings.imageMaxWidth,
				timestamp: formatDisplayTimestamp(now),
				calloutType: settings.calloutType,
				insertHeading: settings.insertHeading,
				insertCallout: settings.insertCallout,
				includeImage: true,
				customTemplate: settings.markdownTemplate,
				placeholderId: generateId(),
				pending: "직접 작성 필요",
			});
			insertBlockAtCursor(editor, markdown);

			savedCount++;
			new Notice(`${evidenceId} 이미지 저장 완료`);
		}

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
	 * Shared helper (also used by the "Paste image as evidence" command in a
	 * later stage): resolve the active file for a given editor/info.
	 */
	resolveActiveFile(info?: MarkdownView | MarkdownFileInfo): TFile | null {
		return info?.file ?? this.plugin.app.workspace.getActiveFile();
	}
}
