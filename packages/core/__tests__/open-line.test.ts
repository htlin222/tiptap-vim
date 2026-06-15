import { modeOf, mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

const editors: { destroy: () => void }[] = []
afterEach(() => {
	for (const e of editors.splice(0)) e.destroy()
})

function mk(html: string, caret: number) {
	const editor = mountEditor(html)
	editors.push(editor)
	editor.commands.enterNormalMode()
	editor.commands.setTextSelection(caret)
	return editor
}

describe('o / O — open line and enter insert mode', () => {
	it('o opens an empty paragraph below and enters insert', () => {
		const editor = mk('<p>alpha</p>', 2)
		sendKeyStream(editor, 'o')
		expect(editor.getHTML()).toBe('<p>alpha</p><p></p>')
		expect(modeOf(editor)).toBe('insert')
		// caret is in the new (second) paragraph
		expect(editor.state.selection.$head.parent.textContent).toBe('')
		expect(editor.state.selection.$head.before()).toBeGreaterThan(2)
	})

	it('O opens an empty paragraph above and enters insert', () => {
		const editor = mk('<p>alpha</p>', 2)
		sendKeyStream(editor, 'O')
		expect(editor.getHTML()).toBe('<p></p><p>alpha</p>')
		expect(modeOf(editor)).toBe('insert')
		// caret is in the first (new, empty) paragraph
		expect(editor.state.selection.$head.parent.textContent).toBe('')
		expect(editor.state.selection.$head.before()).toBe(0)
	})

	it('o below the middle line of three', () => {
		const editor = mk('<p>one</p><p>two</p><p>three</p>', 7) // in "two"
		sendKeyStream(editor, 'o')
		expect(editor.getHTML()).toBe('<p>one</p><p>two</p><p></p><p>three</p>')
		expect(modeOf(editor)).toBe('insert')
	})
})
