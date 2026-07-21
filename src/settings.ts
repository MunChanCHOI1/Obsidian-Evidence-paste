import { App, PluginSettingTab, Setting } from "obsidian";
import type EvidencePastePlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";
import { formatEvidenceId } from "./evidence/evidence-id";
import { renderEvidenceBlock } from "./evidence/template-renderer";

/*
 * Full settings surface (AI-free):
 *
 *   - attachment folder, evidence prefix, number padding
 *   - image max width, callout type
 *   - heading / callout toggles
 *   - custom markdown template with a LIVE preview
 *   - reset to defaults (two-click confirm, no destructive surprise)
 *   - invalid values fall back to sane defaults
 */

function parseIntOr(value: string, fallback: number, min: number, max: number): number {
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, n));
}

export class EvidencePasteSettingTab extends PluginSettingTab {
	plugin: EvidencePastePlugin;
	private previewEl: HTMLElement | null = null;
	private resetArmed = false;

	constructor(app: App, plugin: EvidencePastePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private async save(): Promise<void> {
		await this.plugin.saveSettings();
		this.updatePreview();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("evidence-paste-settings");
		this.resetArmed = false;

		containerEl.createEl("h2", { text: "Evidence Paste" });

		// ---- 파일/폴더 ----
		new Setting(containerEl)
			.setName("첨부 폴더")
			.setDesc("증적 이미지를 저장할 Vault 내 폴더 경로 (예: attachments/evidence). 없으면 자동 생성됩니다.")
			.addText((text) =>
				text
					.setPlaceholder("attachments/evidence")
					.setValue(this.plugin.settings.attachmentFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentFolder = value.trim();
						await this.save();
					})
			);

		// ---- 증적 번호 ----
		new Setting(containerEl)
			.setName("증적 접두사")
			.setDesc("증적 번호 접두사 (예: EV → EV-001).")
			.addText((text) =>
				text
					.setPlaceholder("EV")
					.setValue(this.plugin.settings.evidencePrefix)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.evidencePrefix = trimmed.length > 0 ? trimmed : "EV";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("증적 번호 자릿수")
			.setDesc("zero-padding 최소 자릿수 (1~10). 예: 3 → EV-001.")
			.addText((text) =>
				text
					.setPlaceholder("3")
					.setValue(String(this.plugin.settings.evidenceNumberPadding))
					.onChange(async (value) => {
						this.plugin.settings.evidenceNumberPadding = parseIntOr(value, DEFAULT_SETTINGS.evidenceNumberPadding, 1, 10);
						await this.save();
					})
			);

		// ---- 이미지 표시 ----
		new Setting(containerEl)
			.setName("이미지 최대 표시 너비 (px)")
			.setDesc("0이면 너비 지정 없음. 예: 480 → ![[..|480]].")
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.imageMaxWidth))
					.onChange(async (value) => {
						this.plugin.settings.imageMaxWidth = parseIntOr(value, DEFAULT_SETTINGS.imageMaxWidth, 0, 4000);
						await this.save();
					})
			);

		// ---- 서식 ----
		new Setting(containerEl)
			.setName("Callout 종류")
			.setDesc("설명 Callout 타입 키워드 (예: evidence → > [!evidence]).")
			.addText((text) =>
				text
					.setPlaceholder("evidence")
					.setValue(this.plugin.settings.calloutType)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.calloutType = trimmed.length > 0 ? trimmed : "evidence";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("제목(헤딩) 삽입")
			.setDesc("이미지 위에 `### 증적 EV-00X` 헤딩을 삽입합니다.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.insertHeading)
					.onChange(async (value) => {
						this.plugin.settings.insertHeading = value;
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("설명 Callout 삽입")
			.setDesc("이미지 아래에 설명용 Callout을 삽입합니다.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.insertCallout)
					.onChange(async (value) => {
						this.plugin.settings.insertCallout = value;
						await this.save();
					})
			);

		// ---- 사용자 정의 템플릿 ----
		const templateSetting = new Setting(containerEl)
			.setName("사용자 정의 Markdown 템플릿")
			.setDesc(
				"비워두면 기본 템플릿을 사용합니다. 변수: {{evidenceId}} {{imagePath}} {{imageName}} {{imageEmbed}} {{timestamp}} {{title}} {{evidenceType}} {{purpose}} {{action}} {{payload}} {{payloadBlock}} {{observation}} {{securityMeaning}} {{reproductionConditions}} {{warnings}} {{calloutType}} {{placeholderId}}"
			);
		templateSetting.addTextArea((text) => {
			text
				.setPlaceholder("(비워두면 기본 템플릿)")
				.setValue(this.plugin.settings.markdownTemplate)
				.onChange(async (value) => {
					this.plugin.settings.markdownTemplate = value;
					await this.save();
				});
			text.inputEl.rows = 12;
			text.inputEl.addClass("evidence-paste-template-input");
		});

		// ---- 미리보기 ----
		new Setting(containerEl).setName("미리보기").setHeading();
		containerEl.createEl("p", {
			text: "현재 설정으로 삽입될 마크다운 예시입니다 (샘플 값).",
			cls: "setting-item-description",
		});
		this.previewEl = containerEl.createEl("pre", { cls: "evidence-paste-preview" });
		this.updatePreview();

		// ---- 초기화 ----
		new Setting(containerEl)
			.setName("설정 초기화")
			.setDesc("모든 설정을 기본값으로 되돌립니다. (사용자 정의 템플릿도 지워집니다.)")
			.addButton((button) => {
				button.setButtonText("기본값으로 초기화").setWarning();
				button.onClick(async () => {
					if (!this.resetArmed) {
						this.resetArmed = true;
						button.setButtonText("정말 초기화하려면 다시 클릭");
						return;
					}
					this.plugin.settings = { ...DEFAULT_SETTINGS };
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}

	/** Re-render the live preview from the current (in-memory) settings. */
	private updatePreview(): void {
		if (!this.previewEl) {
			return;
		}
		const s = this.plugin.settings;
		const sampleId = formatEvidenceId(s.evidencePrefix || "EV", 1, s.evidenceNumberPadding);
		const folder = (s.attachmentFolder || "attachments/evidence").replace(/\/+$/, "");
		const imageName = `${sampleId}_20260720_103500.png`;
		let markdown: string;
		try {
			markdown = renderEvidenceBlock({
				evidenceId: sampleId,
				imagePath: `${folder}/${imageName}`,
				imageName,
				imageMaxWidth: s.imageMaxWidth,
				timestamp: "2026-07-20 10:35:00",
				calloutType: s.calloutType,
				insertHeading: s.insertHeading,
				insertCallout: s.insertCallout,
				includeImage: true,
				customTemplate: s.markdownTemplate,
				placeholderId: "preview",
				pending: "직접 작성 필요",
			});
		} catch {
			markdown = "(미리보기를 렌더링할 수 없습니다 — 기본 템플릿으로 대체됩니다.)";
		}
		this.previewEl.setText(markdown);
	}
}
