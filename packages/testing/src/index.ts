import type { Editor } from '@tiptap/core'

/**
 * Dispatch a keydown on an Editor's view DOM. Replaces the ad-hoc helpers
 * that individual test files were defining locally.
 */
export function sendKey(editor: Editor, key: string, init: KeyboardEventInit = {}): void {
	editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }))
}

/**
 * Dispatch a sequence of keydowns (no modifier support yet).
 */
export function sendKeys(editor: Editor, keys: Iterable<string>): void {
	for (const k of keys) sendKey(editor, k)
}
