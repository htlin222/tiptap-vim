import type { Editor } from '@tiptap/core'
import { VimMode } from '@prose-motions/core'
import { Editor as TiptapEditor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

/**
 * Dispatch a keydown on an Editor's view DOM. Mirrors the ad-hoc helper
 * several tests were defining locally — consolidating here so M3+ motions can
 * share one implementation.
 */
export function sendKey(editor: Editor, key: string, init: KeyboardEventInit = {}): void {
	editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))
}

/**
 * Dispatch a sequence of single-character keydowns. Modifiers are not parsed
 * from the string; use `sendKey` directly for <C-…>/<Esc>-style inputs.
 */
export function sendKeys(editor: Editor, keys: Iterable<string>): void {
	for (const k of keys) sendKey(editor, k)
}

/**
 * Read the current vim mode reported by the prose-motions extension.
 * Returns `'insert'` if the extension is not mounted.
 */
export function modeOf(editor: Editor): 'normal' | 'insert' {
	const storage = editor.storage as { vimMode?: { state?: { mode?: 'normal' | 'insert' } } }
	return storage.vimMode?.state?.mode ?? 'insert'
}

/**
 * Mount a Tiptap editor wired to the prose-motions extension. The returned
 * editor is attached to document.body so view.coordsAtPos/posAtCoords work.
 * Remember to call `.destroy()` in a teardown hook.
 */
export function mountEditor(html: string): Editor {
	const host = document.createElement('div')
	document.body.appendChild(host)
	return new TiptapEditor({
		element: host,
		extensions: [StarterKit, VimMode],
		content: html,
	})
}

const NAMED_KEY_ALIASES: Record<string, string> = {
	'<Esc>': 'Escape',
	'<CR>': 'Enter',
	'<Tab>': 'Tab',
	'<BS>': 'Backspace',
	'<Space>': ' ',
	'<Up>': 'ArrowUp',
	'<Down>': 'ArrowDown',
	'<Left>': 'ArrowLeft',
	'<Right>': 'ArrowRight',
}

/**
 * Parse a vim-ish key stream into a list of DOM KeyboardEventInit records.
 * Supported forms:
 *   - Bare chars: `dd`, `3w`, `yy`
 *   - Named: `<Esc>`, `<CR>`, `<Tab>`, `<BS>`, `<Space>`, `<Up>` etc.
 *
 * Modifier combos like `<C-r>` are not supported yet — M3 motions don't
 * require them.
 */
export function parseKeyStream(input: string): KeyboardEventInit[] {
	const out: KeyboardEventInit[] = []
	let i = 0
	while (i < input.length) {
		const ch = input[i]
		if (ch === '<') {
			const end = input.indexOf('>', i)
			if (end === -1)
				throw new Error(`[testing] unterminated key token at ${i}`)
			const token = input.slice(i, end + 1)
			const key = NAMED_KEY_ALIASES[token]
			if (!key)
				throw new Error(`[testing] unknown key token ${token}`)
			out.push({ key })
			i = end + 1
		}
		else {
			out.push({ key: ch })
			i++
		}
	}
	return out
}

/**
 * Run a vim-ish key stream against an editor that's already in normal mode.
 */
export function sendKeyStream(editor: Editor, keys: string): void {
	for (const init of parseKeyStream(keys)) {
		editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', init))
	}
}

/**
 * Convenience wrapper: mount with `html`, flip to normal mode, park the caret
 * at PM position `caret` (post-mode-change so the engine doesn't shift it),
 * run the key stream, return the editor. The caller asserts on
 * `editor.getHTML()` / `editor.state.selection`.
 */
export function runMotion(
	html: string,
	caret: number,
	keys: string,
): { editor: Editor, finalPos: number } {
	const editor = mountEditor(html)
	editor.commands.enterNormalMode()
	editor.commands.setTextSelection(caret)
	sendKeyStream(editor, keys)
	return { editor, finalPos: editor.state.selection.$head.pos }
}
