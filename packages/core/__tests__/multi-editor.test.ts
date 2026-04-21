import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { VimMode } from '../src'

function mountEditor(html: string): Editor {
	const host = document.createElement('div')
	document.body.appendChild(host)
	return new Editor({
		element: host,
		extensions: [StarterKit, VimMode],
		content: html,
	})
}

function pressKey(editor: Editor, key: string) {
	editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('vimMode multi-editor isolation', () => {
	const editors: Editor[] = []

	afterEach(() => {
		while (editors.length) {
			const e = editors.pop()!
			e.destroy()
		}
		document.body.innerHTML = ''
	})

	it('does not let editor A\'s pending `d` trigger `dd` in editor B', () => {
		const a = mountEditor('<p>alpha line</p>')
		const b = mountEditor('<p>bravo line</p>')
		editors.push(a, b)

		a.commands.enterNormalMode()
		b.commands.enterNormalMode()

		const aBefore = a.getHTML()
		const bBefore = b.getHTML()

		// Arm editor A's pending `d`, then immediately press `d` in editor B.
		pressKey(a, 'd')
		pressKey(b, 'd')

		// Neither editor should have deleted a line — each `d` is still the
		// pending first half of `dd`, scoped to its own editor. If state leaked
		// across editors, the second `d` would complete `dd` on one of them.
		expect(a.getHTML()).toBe(aBefore)
		expect(b.getHTML()).toBe(bBefore)
	})

	it('completes `dd` only within the same editor', () => {
		const a = mountEditor('<p>first</p><p>second</p>')
		const b = mountEditor('<p>other</p>')
		editors.push(a, b)

		a.commands.enterNormalMode()
		b.commands.enterNormalMode()
		a.commands.setTextSelection(2)

		const bBefore = b.getHTML()

		pressKey(a, 'd')
		pressKey(b, 'd') // must not consume A's pending op
		pressKey(a, 'd') // this one completes `dd` in A

		expect(b.getHTML()).toBe(bBefore)
		expect(a.getHTML()).not.toContain('first')
	})
})
