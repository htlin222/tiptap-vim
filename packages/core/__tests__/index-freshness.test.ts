import { mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// The adapter rebuilds its LineIndex only on doc changes (selection-only
// motions skip it for perf). Doc changes that happen OUTSIDE the adapter — e.g.
// Insert-mode typing handled by ProseMirror/Tiptap — must still be picked up
// before the next engine command. The keymap plugin calls `ensureFresh()` to
// guarantee that. These tests simulate an external change via a Tiptap command
// (which dispatches a transaction without going through the adapter).

const editors: { destroy: () => void }[] = []
afterEach(() => {
	for (const e of editors.splice(0)) e.destroy()
})

describe('LineIndex stays fresh across external doc changes', () => {
	it('a motion after an external append sees the new lines', () => {
		const editor = mountEditor('<p>one</p>')
		editors.push(editor)
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(2)

		// External change (not via the adapter): append a paragraph.
		editor.commands.insertContentAt(editor.state.doc.content.size, '<p>two</p>')

		// G → last line, dd → delete it. If the index were stale (1 line), this
		// would wrongly delete "one".
		sendKeyStream(editor, 'Gdd')
		expect(editor.getHTML()).toBe('<p>one</p>')
	})

	it('$ lands at the true end after the line grew externally', () => {
		const editor = mountEditor('<p>hi</p>')
		editors.push(editor)
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1)

		// Grow the line externally.
		editor.commands.insertContentAt(3, ' there world')
		// '$' then 'x' should delete the final char of the *current* line.
		sendKeyStream(editor, '$x')
		expect(editor.getHTML()).toBe('<p>hi there worl</p>')
	})
})
