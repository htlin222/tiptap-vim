import type { Editor } from '@tiptap/core'
import { vimAdapterOf } from '@prose-motions/core'
import { mountEditor } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
//  marksPlugin — decorations backed by PM, remapped via tr.mapping.
// ---------------------------------------------------------------------------

describe('markText via PM decorations', () => {
	const created: Editor[] = []

	afterEach(() => {
		while (created.length) created.pop()!.destroy()
		document.body.innerHTML = ''
	})

	it('survives an insertion that pushes its range forward', () => {
		const editor = mountEditor('<p>foo bar baz</p>')
		created.push(editor)
		const adapter = vimAdapterOf(editor)!

		// Mark "bar" (text offset 4..7 in "foo bar baz" → PM 5..8).
		const handle = adapter.markText(
			{ line: 0, ch: 4 },
			{ line: 0, ch: 7 },
			{ className: 'test-mark' },
		)
		expect(handle.find()).toEqual({ from: 5, to: 8 })

		// Insert "HEY " at the start of the paragraph → PM pos 1.
		editor.commands.insertContentAt(1, 'HEY ')

		// The mark should now cover the same "bar" text, shifted by 4.
		const after = handle.find()
		expect(after).toEqual({ from: 9, to: 12 })

		// Content at those positions should still be "bar".
		const text = editor.state.doc.textBetween(after!.from, after!.to)
		expect(text).toBe('bar')
	})

	it('clear() removes the mark from plugin state', () => {
		const editor = mountEditor('<p>hello world</p>')
		created.push(editor)
		const adapter = vimAdapterOf(editor)!

		const handle = adapter.markText({ line: 0, ch: 0 }, { line: 0, ch: 5 })
		expect(handle.find()).not.toBeNull()
		handle.clear()
		expect(handle.find()).toBeNull()
	})
})
