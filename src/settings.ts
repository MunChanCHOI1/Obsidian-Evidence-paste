import { App, PluginSettingTab, Setting } from "obsidian";
import type EvidencePastePlugin from "./main";
import { DEFAULT_SETTINGS, MODE_LABELS, PASTE_MODES, PasteMode } from "./types";
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

		// ---- 동작 (브라우저 익스텐션식 ON/OFF + 모드) ----
		new Setting(containerEl).setName("동작").setHeading();

		new Setting(containerEl)
			.setName("플러그인 활성화")
			.setDesc("끄면 이미지 붙여넣기를 가로채지 않고 Obsidian 기본 동작을 사용합니다. 리본 아이콘·상태바에서도 전환할 수 있습니다.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.save();
						this.plugin.refreshUi();
					})
			);

		new Setting(containerEl)
			.setName("활성 모드")
			.setDesc("붙여넣기 시 삽입할 형식. 정찰=대상/도구·명령/발견, 증적=전체 구조화 콜아웃, 기본=이미지+캡션.")
			.addDropdown((dd) => {
				for (const mode of PASTE_MODES) {
					dd.addOption(mode, MODE_LABELS[mode]);
				}
				dd.setValue(this.plugin.settings.activeMode).onChange(async (value) => {
					this.plugin.settings.activeMode = value as PasteMode;
					await this.save();
					this.plugin.refreshUi();
				});
			});

		new Setting(containerEl)
			.setName("붙여넣기 시 마스킹(레디렉션)")
			.setDesc("이미지 붙여넣기 전에 편집기를 열어 자격증명·토큰·PII를 검은 상자로 가립니다. 가린 영역은 저장 이미지에서 실제로 제거됩니다. 여러 장이면 순차적으로 열리며, 결과는 PNG로 저장됩니다(webp/gif는 애니메이션이 사라짐).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.redactOnPaste)
					.onChange(async (value) => {
						this.plugin.settings.redactOnPaste = value;
						await this.save();
						this.plugin.refreshUi();
					})
			);

		// ---- 파일/폴더 ----
		new Setting(containerEl).setName("공통").setHeading();

		new Setting(containerEl)
			.setName("첨부 기본 폴더")
			.setDesc("캡처 이미지를 저장할 기본(base) 폴더. 실제 저장 위치는 이 폴더 아래의 프로젝트 하위 폴더입니다 (예: attachments/evidence/<프로젝트>). 없으면 자동 생성됩니다.")
			.addText((text) =>
				text
					.setPlaceholder("attachments/evidence")
					.setValue(this.plugin.settings.attachmentFolder)
					.onChange(async (value) => {
						this.plugin.settings.attachmentFolder = value.trim();
						await this.save();
						this.plugin.refreshUi();
					})
			);

		new Setting(containerEl)
			.setName("현재 프로젝트")
			.setDesc("캡처 이미지가 저장될 프로젝트 폴더명. 비워두면 플러그인을 처음 켤 때(또는 첫 붙여넣기 시) 물어봅니다. 리본/상태바 메뉴의 ‘프로젝트 변경…’으로도 바꿀 수 있습니다.")
			.addText((text) =>
				text
					.setPlaceholder("(미지정)")
					.setValue(this.plugin.settings.currentProject)
					.onChange(async (value) => {
						// 저장 시엔 원문 유지, 폴더 경로 생성 시 정제됩니다.
						this.plugin.settings.currentProject = value;
						await this.save();
						this.plugin.refreshUi();
					})
			);

		// ---- 증적(evidence) 모드 ----
		new Setting(containerEl).setName("증적 모드").setHeading();

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

		// ---- 정찰(recon) 모드 ----
		new Setting(containerEl).setName("정찰 모드").setHeading();

		new Setting(containerEl)
			.setName("정찰 접두사")
			.setDesc("정찰 번호 접두사 (예: RC → RC-001). 증적 번호와 별도로 매겨집니다.")
			.addText((text) =>
				text
					.setPlaceholder("RC")
					.setValue(this.plugin.settings.reconPrefix)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.reconPrefix = trimmed.length > 0 ? trimmed : "RC";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("정찰 제목(헤딩) 삽입")
			.setDesc("정찰 이미지 위에 `### 정찰 RC-00X` 헤딩을 삽입합니다.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.reconInsertHeading)
					.onChange(async (value) => {
						this.plugin.settings.reconInsertHeading = value;
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("정찰 대상 기본값")
			.setDesc("정찰 붙여넣기 모달의 ‘대상’에 미리 채워질 값입니다. 붙여넣을 때마다 마지막 입력값으로 자동 갱신됩니다.")
			.addText((text) =>
				text
					.setPlaceholder("(없음)")
					.setValue(this.plugin.settings.lastReconTarget)
					.onChange(async (value) => {
						this.plugin.settings.lastReconTarget = value.trim();
						await this.save();
					})
			);

		containerEl.createEl("p", {
			text: "기본 모드는 별도 설정이 없습니다. 캡션은 붙여넣을 때 입력합니다.",
			cls: "setting-item-description",
		});

		// ---- 페이로드(payload) 모드 ----
		new Setting(containerEl).setName("페이로드 모드").setHeading();
		containerEl.createEl("p", {
			text: "페이로드 모드는 이미지가 아니라 텍스트 붙여넣기를 가로챕니다. HTTP 요청/응답을 자동 감지해 코드블록으로 감싸고, 대상·설명과 함께 콜아웃으로 기록합니다.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("페이로드 접두사")
			.setDesc("페이로드 번호 접두사 (예: PL → PL-001). 증적/정찰과 별도로 매겨집니다.")
			.addText((text) =>
				text
					.setPlaceholder("PL")
					.setValue(this.plugin.settings.payloadPrefix)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.payloadPrefix = trimmed.length > 0 ? trimmed : "PL";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("페이로드 Callout 종류")
			.setDesc("페이로드 콜아웃 타입 키워드 (예: payload → > [!payload]).")
			.addText((text) =>
				text
					.setPlaceholder("payload")
					.setValue(this.plugin.settings.payloadCalloutType)
					.onChange(async (value) => {
						const trimmed = value.trim();
						this.plugin.settings.payloadCalloutType = trimmed.length > 0 ? trimmed : "payload";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("페이로드 제목(헤딩) 삽입")
			.setDesc("페이로드 콜아웃 위에 `### 페이로드 PL-00X` 헤딩을 삽입합니다.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.payloadInsertHeading)
					.onChange(async (value) => {
						this.plugin.settings.payloadInsertHeading = value;
						await this.save();
					})
			);

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
