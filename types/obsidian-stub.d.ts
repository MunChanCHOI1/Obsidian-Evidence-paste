/*
 * MINIMAL, HAND-WRITTEN SUBSET of the Obsidian public API type definitions.
 *
 * WHY THIS EXISTS:
 *   The cloud development environment cannot `npm install obsidian`, so this
 *   stub lets `tsc --noEmit -p tsconfig.check.json` type-check the source
 *   WITHOUT the real package. It is NOT shipped and NOT used by the real build.
 *   The real build (`npm run build`) uses the genuine `obsidian` package types.
 *
 *   Only the members actually used by this plugin are declared here, and they
 *   are kept intentionally faithful to the real signatures. When a new API is
 *   used in a later stage, it is added here as well.
 */

declare module "obsidian" {
	export interface PluginManifest {
		id: string;
		name: string;
		version: string;
		minAppVersion: string;
		description: string;
		author: string;
		authorUrl?: string;
		isDesktopOnly?: boolean;
	}

	export interface Command {
		id: string;
		name: string;
		callback?: () => any;
		editorCallback?: (editor: Editor, ctx: MarkdownView) => any;
		checkCallback?: (checking: boolean) => boolean | void;
		editorCheckCallback?: (
			checking: boolean,
			editor: Editor,
			ctx: MarkdownView
		) => boolean | void;
	}

	export interface EventRef {}

	export class Events {
		on(name: string, callback: (...data: any[]) => any, ctx?: any): EventRef;
		off(name: string, callback: (...data: any[]) => any): void;
		offref(ref: EventRef): void;
		trigger(name: string, ...data: any[]): void;
	}

	export class Notice {
		constructor(message: string | DocumentFragment, timeout?: number);
		setMessage(message: string | DocumentFragment): this;
		hide(): void;
		noticeEl: HTMLElement;
	}

	export class App {
		workspace: Workspace;
		vault: Vault;
		metadataCache: MetadataCache;
		keymap: unknown;
		lastEvent: UserEvent | null;
		// NOTE: `app.setting` is intentionally NOT declared here — it is an
		// internal API absent from the official types. Code must access it via
		// a cast, matching what the real build allows.
	}

	export type UserEvent = MouseEvent | KeyboardEvent | TouchEvent | PointerEvent;

	export class Workspace extends Events {
		activeEditor: MarkdownFileInfo | null;
		getActiveViewOfType<T>(type: Constructor<T>): T | null;
		getActiveFile(): TFile | null;
		on(name: "editor-paste", callback: (evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any, ctx?: any): EventRef;
		on(name: string, callback: (...data: any[]) => any, ctx?: any): EventRef;
	}

	export interface Constructor<T> {
		new (...args: any[]): T;
	}

	export interface MarkdownFileInfo {
		app: App;
		editor?: Editor;
		file: TFile | null;
	}

	export class MetadataCache {
		getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
	}

	export abstract class Vault extends Events {
		adapter: DataAdapter;
		getName(): string;
		getAbstractFileByPath(normalizedPath: string): TAbstractFile | null;
		createFolder(normalizedPath: string): Promise<TFolder>;
		createBinary(normalizedPath: string, data: ArrayBuffer): Promise<TFile>;
		create(normalizedPath: string, data: string): Promise<TFile>;
		read(file: TFile): Promise<string>;
		modify(file: TFile, data: string): Promise<void>;
		getFiles(): TFile[];
	}

	export interface DataAdapter {
		exists(normalizedPath: string, sensitive?: boolean): Promise<boolean>;
	}

	export abstract class TAbstractFile {
		vault: Vault;
		path: string;
		name: string;
		parent: TFolder | null;
	}

	export class TFile extends TAbstractFile {
		stat: { ctime: number; mtime: number; size: number };
		basename: string;
		extension: string;
	}

	export class TFolder extends TAbstractFile {
		children: TAbstractFile[];
		isRoot(): boolean;
	}

	export interface EditorPosition {
		line: number;
		ch: number;
	}

	export interface EditorRange {
		from: EditorPosition;
		to: EditorPosition;
	}

	export abstract class Editor {
		getValue(): string;
		setValue(content: string): void;
		getLine(line: number): string;
		lineCount(): number;
		getCursor(string?: "from" | "to" | "head" | "anchor"): EditorPosition;
		setCursor(pos: EditorPosition | number, ch?: number): void;
		replaceRange(
			replacement: string,
			from: EditorPosition,
			to?: EditorPosition
		): void;
		replaceSelection(replacement: string): void;
		getRange(from: EditorPosition, to: EditorPosition): string;
		lastLine(): number;
		offsetToPos(offset: number): EditorPosition;
		posToOffset(pos: EditorPosition): number;
		focus(): void;
	}

	export abstract class Component {
		load(): void;
		onload(): void;
		unload(): void;
		onunload(): void;
		addChild<T extends Component>(component: T): T;
		registerEvent(eventRef: EventRef): void;
		registerInterval(id: number): number;
	}

	export abstract class Plugin extends Component {
		app: App;
		manifest: PluginManifest;
		constructor(app: App, manifest: PluginManifest);
		onload(): void | Promise<void>;
		onunload(): void;
		addCommand(command: Command): Command;
		addSettingTab(settingTab: PluginSettingTab): void;
		registerEvent(eventRef: EventRef): void;
		addStatusBarItem(): HTMLElement;
		addRibbonIcon(
			icon: string,
			title: string,
			callback: (evt: MouseEvent) => any
		): HTMLElement;
		loadData(): Promise<any>;
		saveData(data: any): Promise<void>;
	}

	export class Menu {
		addItem(cb: (item: MenuItem) => any): this;
		addSeparator(): this;
		showAtMouseEvent(evt: MouseEvent): this;
		showAtPosition(position: { x: number; y: number }): this;
		hide(): this;
	}

	export class MenuItem {
		setTitle(title: string | DocumentFragment): this;
		setIcon(icon: string | null): this;
		setChecked(checked: boolean | null): this;
		setDisabled(disabled: boolean): this;
		setSection(section: string): this;
		setIsLabel(isLabel: boolean): this;
		onClick(callback: (evt: MouseEvent | KeyboardEvent) => any): this;
	}

	export abstract class Modal {
		app: App;
		contentEl: HTMLElement;
		titleEl: HTMLElement;
		modalEl: HTMLElement;
		constructor(app: App);
		open(): void;
		close(): void;
		onOpen(): void;
		onClose(): void;
		setTitle(title: string): this;
	}

	export function setIcon(parent: HTMLElement, iconId: string): void;

	export abstract class PluginSettingTab {
		app: App;
		containerEl: HTMLElement;
		constructor(app: App, plugin: Plugin);
		display(): void;
		hide(): void;
	}

	export class Setting {
		settingEl: HTMLElement;
		infoEl: HTMLElement;
		nameEl: HTMLElement;
		descEl: HTMLElement;
		controlEl: HTMLElement;
		constructor(containerEl: HTMLElement);
		setName(name: string | DocumentFragment): this;
		setDesc(desc: string | DocumentFragment): this;
		setClass(cls: string): this;
		setHeading(): this;
		setDisabled(disabled: boolean): this;
		addText(cb: (text: TextComponent) => any): this;
		addTextArea(cb: (text: TextAreaComponent) => any): this;
		addToggle(cb: (toggle: ToggleComponent) => any): this;
		addDropdown(cb: (dropdown: DropdownComponent) => any): this;
		addButton(cb: (button: ButtonComponent) => any): this;
		addExtraButton(cb: (button: ExtraButtonComponent) => any): this;
	}

	export abstract class AbstractTextComponent<T extends HTMLElement> extends ValueComponent<string> {
		inputEl: T;
		getValue(): string;
		setValue(value: string): this;
		setPlaceholder(placeholder: string): this;
		onChanged(): void;
		onChange(callback: (value: string) => any): this;
	}

	export class TextComponent extends AbstractTextComponent<HTMLInputElement> {}
	export class TextAreaComponent extends AbstractTextComponent<HTMLTextAreaElement> {}

	export abstract class ValueComponent<T> extends BaseComponent {
		getValue(): T;
		setValue(value: T): this;
	}

	export abstract class BaseComponent {
		disabled: boolean;
		setDisabled(disabled: boolean): this;
		then(cb: (component: this) => any): this;
	}

	export class ToggleComponent extends ValueComponent<boolean> {
		toggleEl: HTMLElement;
		getValue(): boolean;
		setValue(on: boolean): this;
		onChange(callback: (value: boolean) => any): this;
	}

	export class DropdownComponent extends ValueComponent<string> {
		selectEl: HTMLSelectElement;
		addOption(value: string, display: string): this;
		addOptions(options: Record<string, string>): this;
		getValue(): string;
		setValue(value: string): this;
		onChange(callback: (value: string) => any): this;
	}

	export class ButtonComponent extends BaseComponent {
		buttonEl: HTMLButtonElement;
		setButtonText(name: string): this;
		setCta(): this;
		setWarning(): this;
		setIcon(icon: string): this;
		setTooltip(tooltip: string): this;
		onClick(callback: (evt: MouseEvent) => any): this;
	}

	export class ExtraButtonComponent extends BaseComponent {
		extraSettingsEl: HTMLElement;
		setIcon(icon: string): this;
		setTooltip(tooltip: string): this;
		onClick(callback: () => any): this;
	}

	export class MarkdownView {
		app: App;
		editor: Editor;
		file: TFile | null;
		getViewType(): string;
	}

	export function normalizePath(path: string): string;

	export interface RequestUrlParam {
		url: string;
		method?: string;
		contentType?: string;
		body?: string | ArrayBuffer;
		headers?: Record<string, string>;
		throw?: boolean;
	}

	export interface RequestUrlResponse {
		status: number;
		headers: Record<string, string>;
		arrayBuffer: ArrayBuffer;
		json: any;
		text: string;
	}

	export function requestUrl(request: RequestUrlParam | string): Promise<RequestUrlResponse>;
}

/*
 * Obsidian augments the DOM lib with helper methods. Declare the subset used.
 */
interface DomElementInfo {
	cls?: string | string[];
	text?: string | DocumentFragment;
	attr?: Record<string, string | number | boolean | null>;
	title?: string;
	href?: string;
	value?: string;
	type?: string;
	placeholder?: string;
}

// NOTE: this file is intentionally a *script* (no top-level import/export) so
// that `declare module "obsidian"` is treated as a global ambient module and
// the top-level `interface HTMLElement` below merges into the global DOM type.
interface HTMLElement {
	empty(): void;
	createEl<K extends keyof HTMLElementTagNameMap>(
		tag: K,
		o?: DomElementInfo | string,
		callback?: (el: HTMLElementTagNameMap[K]) => void
	): HTMLElementTagNameMap[K];
	createDiv(o?: DomElementInfo | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement;
	createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
	setText(val: string | DocumentFragment): void;
	addClass(...classes: string[]): void;
	removeClass(...classes: string[]): void;
	toggleClass(classes: string | string[], value: boolean): void;
	setAttr(qualifiedName: string, value: string | number | boolean | null): void;
}
