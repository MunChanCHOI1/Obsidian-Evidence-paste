import { Editor, MarkdownFileInfo, MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, EvidencePasteSettings } from "./types";
import { EvidencePasteSettingTab } from "./settings";
import { PasteHandler } from "./paste/paste-handler";
import { nextEvidenceIds } from "./evidence/evidence-id";
import { formatDisplayTimestamp } from "./evidence/file-naming";
import { renderEvidenceBlock } from "./evidence/template-renderer";
import { insertBlockAtCursor } from "./paste/evidence-inserter";
import { generateId } from "./utils/id";

const LOG_PREFIX = "[Evidence Paste]";

/*
 * Plugin entry point (AI-free evidence logger).
 *
 * - Loads/saves settings and registers the settings tab
 * - Registers the `editor-paste` handler: image pastes are captured, saved to
 *   the attachment folder with an evidence-numbered file name, and a full
 *   evidence block (heading + embed + description callout) is inserted at the
 *   cursor. Text pastes are left to Obsidian's default behavior.
 * - Provides an "insert empty evidence template" command and an
 *   "open settings" command.
 */
export default class EvidencePastePlugin extends Plugin {
	settings: EvidencePasteSettings = DEFAULT_SETTINGS;
	private pasteHandler!: PasteHandler;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.pasteHandler = new PasteHandler(this);

		this.addSettingTab(new EvidencePasteSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on(
				"editor-paste",
				(
					evt: ClipboardEvent,
					editor: Editor,
					info: MarkdownView | MarkdownFileInfo
				) => {
					this.pasteHandler.handleEditorPaste(evt, editor, info);
				}
			)
		);

		this.addCommand({
			id: "insert-empty-template",
			name: "Insert empty evidence template",
			editorCallback: (editor: Editor) => {
				this.insertEmptyTemplate(editor);
			},
		});

		this.addCommand({
			id: "open-settings",
			name: "Open plugin settings",
			callback: () => {
				// `app.setting` is an internal (undocumented) API not present in
				// the official type definitions, so access it via a narrow cast.
				const setting = (this.app as unknown as {
					setting?: { open(): void; openTabById(id: string): void };
				}).setting;
				setting?.open();
				setting?.openTabById(this.manifest.id);
			},
		});

		console.log(`${LOG_PREFIX} loaded (v${this.manifest.version})`);
	}

	onunload(): void {
		console.log(`${LOG_PREFIX} unloaded`);
	}

	/**
	 * Insert an empty evidence template (no image) at the cursor, using the
	 * next evidence id for the active note. Reuses the same renderer as paste.
	 */
	private insertEmptyTemplate(editor: Editor): void {
		const [evidenceId] = nextEvidenceIds(
			editor.getValue(),
			this.settings.evidencePrefix,
			this.settings.evidenceNumberPadding,
			1
		);
		const block = renderEvidenceBlock({
			evidenceId,
			imagePath: "",
			imageName: "",
			imageMaxWidth: this.settings.imageMaxWidth,
			timestamp: formatDisplayTimestamp(new Date()),
			calloutType: this.settings.calloutType,
			insertHeading: this.settings.insertHeading,
			insertCallout: this.settings.insertCallout,
			includeImage: false,
			customTemplate: this.settings.markdownTemplate,
			placeholderId: generateId(),
			pending: "직접 작성 필요",
		});
		insertBlockAtCursor(editor, block);
		new Notice(`${evidenceId} 빈 증적 템플릿 삽입`);
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<EvidencePasteSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
