import { mountEditor, sendKeyStream } from '@prose-motions/testing'
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

describe('undo / redo', () => {
	it('u undoes a dd', () => {
		const editor = mk('<p>alpha</p><p>bravo</p>', 2)
		sendKeyStream(editor, 'dd')
		expect(editor.getHTML()).toBe('<p>bravo</p>')
		sendKeyStream(editor, 'u')
		expect(editor.getHTML()).toBe('<p>alpha</p><p>bravo</p>')
	})

	it('u undoes an insert-mode edit', () => {
		const editor = mk('<p>hello</p>', 1)
		sendKeyStream(editor, 'x') // delete 'h'
		expect(editor.getHTML()).toBe('<p>ello</p>')
		sendKeyStream(editor, 'u')
		expect(editor.getHTML()).toBe('<p>hello</p>')
	})

	it('Ctrl-r redoes', () => {
		const editor = mk('<p>alpha</p><p>bravo</p>', 2)
		sendKeyStream(editor, 'dd')
		sendKeyStream(editor, 'u')
		expect(editor.getHTML()).toBe('<p>alpha</p><p>bravo</p>')
		// <C-r>
		editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true }))
		expect(editor.getHTML()).toBe('<p>bravo</p>')
	})
})
