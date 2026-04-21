import type { Editor } from '@tiptap/core'

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
