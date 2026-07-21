import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
	setIcon,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	EvidencePasteSettings,
	MODE_LABELS,
	PASTE_MODES,
	PasteMode,
} from "./types";
import { EvidencePasteSettingTab } from "./settings";
import { PasteHandler } from "./paste/paste-handler";
import { counterKey, nextEvidenceIdsScoped } from "./evidence/evidence-id";
import { formatDisplayTimestamp } from "./evidence/file-naming";
import { renderEvidenceBlock } from "./evidence/template-renderer";
import { insertBlockAtCursor } from "./paste/evidence-inserter";
import { generateId } from "./utils/id";
import { promptFields } from "./ui/mode-input-modal";
import { projectImageFolder, sanitizeProjectName } from "./utils/project";

const LOG_PREFIX = "[Evidence Paste]";

/** Short one-line hint shown next to each mode in the ribbon menu. */
const MODE_HINTS: Record<PasteMode, string> = {
	recon: "정찰 — 대상/도구·명령/발견",
	evidence: "증적 — 전체 구조화 콜아웃",
	basic: "기본 — 이미지 + 캡션",
	payload: "페이로드 — 텍스트/HTTP 캡처",
};

/*
 * Plugin entry point (AI-free evidence logger).
 *
 * Works like a browser extension:
 *   - A ribbon icon opens a popup menu with a master ON/OFF toggle and a
 *     radio-style picker for the active mode (정찰 / 증적 / 기본).
 *   - A clickable status-bar badge shows the current state and opens the same
 *     menu.
 *   - The `editor-paste` handler intercepts image pastes only while enabled,
 *     inserting the block for the active mode. Text pastes are never touched.
 */
export default class EvidencePastePlugin extends Plugin {
	settings: EvidencePasteSettings = DEFAULT_SETTINGS;
	private pasteHandler!: PasteHandler;
	private statusBarEl: HTMLElement | null = null;
	private statusIconEl: HTMLElement | null = null;
	private statusTextEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.pasteHandler = new PasteHandler(this);

		this.addSettingTab(new EvidencePasteSettingTab(this.app, this));

		// Ribbon icon = the "extension icon"; clicking opens the popup menu.
		this.addRibbonIcon("shield-check", "Evidence Paste", (evt: MouseEvent) => {
			this.openModeMenu(evt);
		});

		// Status-bar badge = at-a-glance state; also opens the menu on click.
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("evidence-paste-statusbar");
		this.statusIconEl = this.statusBarEl.createSpan({ cls: "evidence-paste-status-icon" });
		this.statusTextEl = this.statusBarEl.createSpan({ cls: "evidence-paste-status-text" });
		this.statusBarEl.addEventListener("click", (evt: MouseEvent) => {
			this.openModeMenu(evt);
		});
		this.refreshUi();

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
			id: "toggle-enabled",
			name: "동작 켜기/끄기 토글",
			callback: () => {
				void this.setEnabled(!this.settings.enabled);
			},
		});

		this.addCommand({
			id: "change-project",
			name: "프로젝트 설정/변경",
			callback: () => {
				void this.changeProject();
			},
		});

		for (const mode of PASTE_MODES) {
			this.addCommand({
				id: `set-mode-${mode}`,
				name: `모드: ${MODE_LABELS[mode]}(으)로 전환`,
				callback: () => {
					void this.setMode(mode);
				},
			});
		}

		this.addCommand({
			id: "insert-empty-template",
			name: "빈 증적 템플릿 삽입",
			editorCallback: (editor: Editor) => {
				void this.insertEmptyTemplate(editor);
			},
		});

		this.addCommand({
			id: "toggle-redaction",
			name: "붙여넣기 시 마스킹 켜기/끄기 토글",
			callback: () => {
				void this.setRedactOnPaste(!this.settings.redactOnPaste);
			},
		});

		this.addCommand({
			id: "open-settings",
			name: "플러그인 설정 열기",
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

	/** Build and show the browser-extension-style popup menu. */
	private openModeMenu(evt: MouseEvent): void {
		const menu = new Menu();

		const projectLabel =
			this.settings.currentProject.trim().length > 0
				? this.settings.currentProject
				: "미지정";
		menu.addItem((item) =>
			item.setTitle(`프로젝트: ${projectLabel}`).setIcon("folder").setDisabled(true)
		);
		menu.addItem((item) =>
			item
				.setTitle("프로젝트 변경…")
				.setIcon("folder-pen")
				.onClick(() => {
					void this.changeProject();
				})
		);

		menu.addSeparator();

		menu.addItem((item) =>
			item
				.setTitle(this.settings.enabled ? "동작 중 — 끄기" : "꺼짐 — 켜기")
				.setIcon(this.settings.enabled ? "toggle-right" : "toggle-left")
				.onClick(() => {
					void this.setEnabled(!this.settings.enabled);
				})
		);

		menu.addItem((item) =>
			item
				.setTitle(this.settings.redactOnPaste ? "마스킹 켜짐 — 끄기" : "붙여넣기 시 마스킹")
				.setIcon(this.settings.redactOnPaste ? "eye-off" : "eye")
				.setChecked(this.settings.redactOnPaste)
				.onClick(() => {
					void this.setRedactOnPaste(!this.settings.redactOnPaste);
				})
		);

		menu.addSeparator();

		for (const mode of PASTE_MODES) {
			menu.addItem((item) =>
				item
					.setTitle(MODE_HINTS[mode])
					.setChecked(this.settings.activeMode === mode)
					.onClick(() => {
						void this.setMode(mode);
					})
			);
		}

		menu.showAtMouseEvent(evt);
	}

	/**
	 * Toggle the master switch. Turning ON requires a project: if none is set,
	 * we prompt for one (and create its folder). Cancelling leaves it OFF.
	 */
	async setEnabled(enabled: boolean): Promise<void> {
		if (enabled) {
			const project = await this.ensureProject();
			if (project === null) {
				this.refreshUi();
				new Notice("프로젝트를 지정해야 켤 수 있습니다.");
				return;
			}
		}
		this.settings.enabled = enabled;
		await this.saveSettings();
		this.refreshUi();
		new Notice(
			enabled
				? `Evidence Paste 켜짐 — 프로젝트: ${this.settings.currentProject}`
				: "Evidence Paste 동작 꺼짐"
		);
	}

	/** Vault-relative folder where images for the current project are saved. */
	imageFolder(): string {
		return projectImageFolder(this.settings.attachmentFolder, this.settings.currentProject);
	}

	/**
	 * Return the current project name, prompting for one when none is set yet.
	 * Returns null if the user cancels. Called on first turn-on and defensively
	 * before the first paste.
	 */
	async ensureProject(): Promise<string | null> {
		const existing = this.settings.currentProject.trim();
		if (existing.length > 0) {
			return existing;
		}
		return this.promptProject("프로젝트 설정", "");
	}

	/** Change (or set) the current project via a prompt, pre-filled with current. */
	async changeProject(): Promise<void> {
		await this.promptProject("프로젝트 변경", this.settings.currentProject);
	}

	/** Shared project prompt: sanitize, persist, create the folder, refresh. */
	private async promptProject(title: string, initial: string): Promise<string | null> {
		const input = await promptFields(this.app, {
			title,
			submitText: "적용",
			fields: [
				{
					key: "project",
					label: "프로젝트 명",
					value: initial,
					placeholder: "예: 2026-웹해킹, target-A",
					description: "캡처 이미지가 이 프로젝트 폴더에 저장됩니다.",
				},
			],
		});
		if (input === null) {
			return null;
		}
		const name = sanitizeProjectName(input.project);
		if (name.length === 0) {
			new Notice("프로젝트 명이 비어 있습니다.");
			return null;
		}
		this.settings.currentProject = name;
		await this.saveSettings();
		await this.pasteHandler.ensureImageFolder();
		this.refreshUi();
		new Notice(`프로젝트: ${name} · 저장 폴더: ${this.imageFolder()}`);
		return name;
	}

	/** Switch the active mode, persist, refresh the badge, and notify. */
	async setMode(mode: PasteMode): Promise<void> {
		this.settings.activeMode = mode;
		await this.saveSettings();
		this.refreshUi();
		new Notice(`모드 전환: ${MODE_LABELS[mode]}`);
	}

	/** Toggle the paste-time redaction editor, persist, and notify. */
	async setRedactOnPaste(on: boolean): Promise<void> {
		this.settings.redactOnPaste = on;
		await this.saveSettings();
		this.refreshUi();
		new Notice(on ? "붙여넣기 시 마스킹 편집 켜짐" : "마스킹 편집 꺼짐");
	}

	/**
	 * Allocate `count` project-wide-unique ids for `prefix`. Folds in both the
	 * persisted per-project counter and any ids already present in `content`,
	 * then persists the advanced counter so the next paste continues from there.
	 */
	async allocateIds(content: string, prefix: string, count: number): Promise<string[]> {
		const project = sanitizeProjectName(this.settings.currentProject);
		const key = counterKey(project, prefix);
		const persistedLast = this.settings.projectCounters[key] ?? 0;
		const { ids, lastUsed } = nextEvidenceIdsScoped(
			content,
			prefix,
			this.settings.evidenceNumberPadding,
			count,
			persistedLast
		);
		this.settings.projectCounters[key] = lastUsed;
		await this.saveSettings();
		return ids;
	}

	/** Re-render the status-bar badge from current settings. */
	refreshUi(): void {
		if (!this.statusIconEl || !this.statusTextEl || !this.statusBarEl) {
			return;
		}
		const enabled = this.settings.enabled;
		const label = enabled ? MODE_LABELS[this.settings.activeMode] : "OFF";
		const project = this.settings.currentProject.trim() || "미지정";
		setIcon(this.statusIconEl, enabled ? "shield-check" : "shield-off");
		this.statusTextEl.setText(label);
		this.statusBarEl.toggleClass("is-disabled", !enabled);
		this.statusBarEl.setAttr(
			"aria-label",
			enabled
				? `Evidence Paste — ${MODE_LABELS[this.settings.activeMode]} 모드 · 프로젝트: ${project} (클릭하여 변경)`
				: `Evidence Paste — 꺼짐 · 프로젝트: ${project} (클릭하여 켜기)`
		);
	}

	/**
	 * Insert an empty evidence template (no image) at the cursor, using the
	 * next evidence id for the active note. Reuses the same renderer as paste.
	 */
	private async insertEmptyTemplate(editor: Editor): Promise<void> {
		const [evidenceId] = await this.allocateIds(
			editor.getValue(),
			this.settings.evidencePrefix,
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
		// Never alias the module-level default object: give this instance its own
		// counter map so allocating ids can't mutate DEFAULT_SETTINGS.
		this.settings.projectCounters = { ...(loaded?.projectCounters ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
