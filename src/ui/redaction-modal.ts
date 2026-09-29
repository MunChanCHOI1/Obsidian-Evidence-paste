import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import {
	Point,
	Rect,
	clampRectToBounds,
	isDegenerateRect,
	mapPointToCanvas,
	normalizeRect,
} from "./redaction-geometry";

/*
 * Screenshot redaction editor.
 *
 * A pasted image is shown on a canvas kept at its NATURAL resolution; the user
 * drags rectangles to paint opaque black boxes over secrets/PII, and the boxes
 * are burned into the exported PNG — the original pixels underneath are gone,
 * not merely covered by an overlay. This is the whole point: a redacted export
 * cannot leak what a CSS overlay or a blur filter might.
 *
 * The modal resolves with:
 *   - { buffer, mime } when the user saves (redacted PNG, or the untouched
 *     original bytes if they explicitly chose "원본 그대로"),
 *   - null when the user cancels, so the caller skips saving that image.
 *
 * Fail-closed: the unredacted original is written ONLY when the user explicitly
 * asks for it. If the image cannot be loaded or the redacted PNG cannot be
 * produced, nothing is saved — the modal stays open (export failure) or skips
 * the image (load failure). The screenshot is still on the clipboard, so the
 * user can simply paste again; nothing is lost by refusing to save.
 */

export interface RedactedImage {
	buffer: ArrayBuffer;
	mime: string;
}

const FILL = "#000000";
const PREVIEW_FILL = "rgba(0, 0, 0, 0.45)";
const ORIGINAL_LABEL = "원본 그대로";
const ORIGINAL_CONFIRM_LABEL = "가린 영역 무시하고 원본 저장";

class RedactionModal extends Modal {
	private readonly rects: Rect[] = [];
	private img: HTMLImageElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private objectUrl: string | null = null;
	private dragStart: Point | null = null;
	private dragCurrent: Point | null = null;
	private resolved = false;
	private saving = false;
	private originalArmed = false;
	private originalButton: ButtonComponent | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly file: File,
		private readonly onResolve: (result: RedactedImage | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("이미지 마스킹");
		contentEl.addClass("evidence-paste-redact");

		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: "드래그하여 자격증명·토큰·PII를 검은 상자로 가립니다. 가린 영역은 저장 이미지에서 실제로 제거됩니다.",
		});

		const canvas = contentEl.createEl("canvas", { cls: "evidence-paste-redact-canvas" });
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.wirePointer(canvas);

		this.countEl = contentEl.createEl("p", { cls: "setting-item-description" });
		this.updateCount();

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("실행취소").onClick(() => {
					this.rects.pop();
					this.redraw();
					this.updateCount();
				})
			)
			.addButton((b) =>
				b.setButtonText("모두 지우기").onClick(() => {
					this.rects.length = 0;
					this.redraw();
					this.updateCount();
				})
			)
			.addButton((b) => {
				this.originalButton = b;
				b.setButtonText(ORIGINAL_LABEL).onClick(() => {
					this.onOriginalClick();
				});
			})
			.addButton((b) =>
				b
					.setButtonText("적용 후 저장")
					.setCta()
					.onClick(() => {
						void this.saveRedacted();
					})
			);

		this.loadImage();
	}

	private loadImage(): void {
		this.objectUrl = URL.createObjectURL(this.file);
		const img = new Image();
		img.onload = () => {
			if (!this.canvas) {
				return;
			}
			this.img = img;
			this.canvas.width = img.naturalWidth || img.width;
			this.canvas.height = img.naturalHeight || img.height;
			this.redraw();
		};
		img.onerror = () => {
			// Fail closed: we cannot show the image, so the user cannot redact it.
			// Skip it rather than silently writing unredacted pixels to the vault.
			new Notice(
				"이미지를 열 수 없어 저장하지 않았습니다. 클립보드에 그대로 있으니 다시 붙여넣어 주세요."
			);
			this.finish(null);
		};
		img.src = this.objectUrl;
	}

	private wirePointer(canvas: HTMLCanvasElement): void {
		const toCanvas = (evt: PointerEvent): Point => {
			const bounds = canvas.getBoundingClientRect();
			return mapPointToCanvas(evt.clientX, evt.clientY, bounds, canvas.width, canvas.height);
		};

		canvas.addEventListener("pointerdown", (evt: PointerEvent) => {
			if (!this.img) {
				return;
			}
			evt.preventDefault();
			canvas.setPointerCapture(evt.pointerId);
			this.dragStart = toCanvas(evt);
			this.dragCurrent = this.dragStart;
			this.redraw();
		});
		canvas.addEventListener("pointermove", (evt: PointerEvent) => {
			if (!this.dragStart) {
				return;
			}
			this.dragCurrent = toCanvas(evt);
			this.redraw();
		});
		const endDrag = (evt: PointerEvent): void => {
			if (!this.dragStart || !this.dragCurrent || !this.canvas) {
				return;
			}
			const rect = clampRectToBounds(
				normalizeRect(this.dragStart, this.dragCurrent),
				this.canvas.width,
				this.canvas.height
			);
			this.dragStart = null;
			this.dragCurrent = null;
			if (!isDegenerateRect(rect)) {
				this.rects.push(rect);
				this.updateCount();
			}
			try {
				canvas.releasePointerCapture(evt.pointerId);
			} catch {
				// ignore: capture may already be gone
			}
			this.redraw();
		};
		canvas.addEventListener("pointerup", endDrag);
		canvas.addEventListener("pointercancel", endDrag);
	}

	private redraw(): void {
		const ctx = this.ctx;
		const canvas = this.canvas;
		if (!ctx || !canvas || !this.img) {
			return;
		}
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(this.img, 0, 0, canvas.width, canvas.height);
		ctx.fillStyle = FILL;
		for (const r of this.rects) {
			ctx.fillRect(r.x, r.y, r.w, r.h);
		}
		if (this.dragStart && this.dragCurrent) {
			const preview = normalizeRect(this.dragStart, this.dragCurrent);
			ctx.fillStyle = PREVIEW_FILL;
			ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
		}
	}

	private updateCount(): void {
		if (this.countEl) {
			this.countEl.setText(`가린 영역: ${this.rects.length}개`);
		}
		// Changing the boxes invalidates a pending "save original" confirmation.
		this.disarmOriginal();
	}

	/**
	 * "원본 그대로" discards every box the user drew. With boxes present it takes
	 * a second click to confirm, so a misclick cannot leak what was masked.
	 */
	private onOriginalClick(): void {
		if (this.rects.length > 0 && !this.originalArmed) {
			this.originalArmed = true;
			this.originalButton?.setButtonText(ORIGINAL_CONFIRM_LABEL).setWarning();
			return;
		}
		void this.saveOriginal();
	}

	private disarmOriginal(): void {
		if (!this.originalArmed) {
			return;
		}
		this.originalArmed = false;
		this.originalButton?.setButtonText(ORIGINAL_LABEL);
		this.originalButton?.buttonEl.removeClass("mod-warning");
	}

	private async saveRedacted(): Promise<void> {
		if (this.saving || this.resolved) {
			return;
		}
		const canvas = this.canvas;
		if (!canvas || !this.img) {
			// Image not loaded yet: exporting now would save a blank canvas.
			new Notice("이미지를 아직 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
			return;
		}
		this.saving = true;
		try {
			// Drop any half-drawn (semi-transparent) preview so only the final,
			// fully opaque boxes are burned into the export.
			this.dragStart = null;
			this.dragCurrent = null;
			this.redraw();
			const blob = await new Promise<Blob | null>((resolve) => {
				canvas.toBlob((b) => resolve(b), "image/png");
			});
			if (!blob) {
				throw new Error("canvas.toBlob returned null");
			}
			const buffer = await blob.arrayBuffer();
			this.finish({ buffer, mime: "image/png" });
		} catch (err) {
			// Fail closed: never substitute the unredacted original. Keep the
			// editor open so the user can retry, explicitly choose the original,
			// or cancel.
			console.error("[evidence-paste] redaction export failed", err);
			new Notice(
				"마스킹 이미지를 만들지 못해 아무것도 저장하지 않았습니다. 다시 시도하거나 취소해 주세요."
			);
		} finally {
			this.saving = false;
		}
	}

	private async saveOriginal(): Promise<void> {
		if (this.saving || this.resolved) {
			return;
		}
		this.saving = true;
		try {
			const buffer = await this.file.arrayBuffer();
			this.finish({ buffer, mime: this.file.type });
		} catch (err) {
			console.error("[evidence-paste] reading original image failed", err);
			new Notice("원본 이미지를 읽지 못해 저장하지 않았습니다.");
		} finally {
			this.saving = false;
		}
	}

	private finish(result: RedactedImage | null): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.onResolve(result);
		this.close();
	}

	onClose(): void {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			// Closing without a decision (Esc / clicking away) skips this image.
			this.onResolve(null);
		}
	}
}

/**
 * Open the redaction editor for one image. Resolves with the bytes to save
 * (redacted PNG or untouched original), or null if the user cancels — in which
 * case the caller must NOT write the image to disk.
 */
export function redactImage(app: App, file: File): Promise<RedactedImage | null> {
	return new Promise((resolve) => {
		new RedactionModal(app, file, resolve).open();
	});
}
