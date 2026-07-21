import { Editor } from "obsidian";

/*
 * Inserts a fully-rendered markdown block into the editor at the cursor.
 *
 * The block content itself (heading + embed + callout) is produced by the
 * template renderer (see evidence/template-renderer.ts). This module only
 * concerns itself with SAFE placement: never gluing onto existing text on the
 * same line, and leaving the cursor after the inserted block so consecutive
 * inserts stack cleanly.
 */

export function insertBlockAtCursor(editor: Editor, text: string): void {
	const cursor = editor.getCursor();
	const lineText = editor.getLine(cursor.line);
	const atLineStart = cursor.ch === 0;
	const beforeCursor = lineText.slice(0, cursor.ch);
	const lineIsBlankBeforeCursor = beforeCursor.trim().length === 0;

	let prefix = "";
	if (!atLineStart && !lineIsBlankBeforeCursor) {
		prefix = "\n\n";
	} else if (!atLineStart) {
		// mid-line but only whitespace before cursor: one newline is enough
		prefix = "\n";
	}

	const block = `${prefix}${text}\n`;
	editor.replaceSelection(block);
}
