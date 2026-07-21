import { App, Modal, Setting } from "obsidian";

/*
 * A small, reusable prompt modal shown at paste time for the lighter modes:
 *   - 기본(basic): one field (캡션).
 *   - 정찰(recon): three fields (대상 / 도구·명령 / 발견).
 *
 * It resolves a Promise with the entered values, or `null` if the user
 * cancels (Esc / 취소 / closing the modal), so the caller can abort cleanly
 * without leaving an orphaned image on disk.
 */

export interface PromptField {
	key: string;
	label: string;
	description?: string;
	placeholder?: string;
	/** Initial value; pre-fills the input (editable). */
	value?: string;
	/** Render a multi-line textarea instead of a single-line input. */
	multiline?: boolean;
}

export interface PromptOptions {
	title: string;
	fields: PromptField[];
	submitText?: string;
}

class FieldPromptModal extends Modal {
	private readonly values: Record<string, string> = {};
	private submitted = false;
	private resolved = false;

	constructor(
		app: App,
		private readonly opts: PromptOptions,
		private readonly onResolve: (result: Record<string, string> | null) => void
	) {
		super(app);
		for (const f of opts.fields) {
			this.values[f.key] = f.value ?? "";
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(this.opts.title);
		contentEl.addClass("evidence-paste-prompt");

		let firstInput: HTMLElement | null = null;

		const wire = (
			el: HTMLElement,
			field: PromptField,
			isFirst: boolean
		): void => {
			if (isFirst) {
				firstInput = el;
			}
			el.addEventListener("keydown", (evt: KeyboardEvent) => {
				// Enter submits on single-line fields; Shift+Enter / textarea keep newlines.
				if (evt.key === "Enter" && !evt.shiftKey && !field.multiline) {
					evt.preventDefault();
					this.submit();
				}
			});
		};

		this.opts.fields.forEach((field, idx) => {
			const setting = new Setting(contentEl).setName(field.label);
			if (field.description) {
				setting.setDesc(field.description);
			}
			if (field.multiline) {
				setting.addTextArea((t) => {
					t.setPlaceholder(field.placeholder ?? "")
						.setValue(field.value ?? "")
						.onChange((v) => {
							this.values[field.key] = v;
						});
					t.inputEl.rows = 3;
					t.inputEl.addClass("evidence-paste-prompt-input");
					wire(t.inputEl, field, idx === 0);
				});
			} else {
				setting.addText((t) => {
					t.setPlaceholder(field.placeholder ?? "")
						.setValue(field.value ?? "")
						.onChange((v) => {
							this.values[field.key] = v;
						});
					t.inputEl.addClass("evidence-paste-prompt-input");
					wire(t.inputEl, field, idx === 0);
				});
			}
		});

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("취소").onClick(() => {
					this.close();
				})
			)
			.addButton((b) =>
				b
					.setButtonText(this.opts.submitText ?? "삽입")
					.setCta()
					.onClick(() => {
						this.submit();
					})
			);

		// Focus the first field once the modal is in the DOM.
		window.setTimeout(() => firstInput?.focus(), 0);
	}

	private submit(): void {
		this.submitted = true;
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.onResolve(this.submitted ? { ...this.values } : null);
	}
}

/**
 * Show a field-prompt modal and resolve with the entered values, or `null`
 * if the user cancels.
 */
export function promptFields(
	app: App,
	opts: PromptOptions
): Promise<Record<string, string> | null> {
	return new Promise((resolve) => {
		new FieldPromptModal(app, opts, resolve).open();
	});
}
