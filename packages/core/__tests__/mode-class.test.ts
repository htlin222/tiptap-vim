import type { Editor } from '@tiptap/core'
import { mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
//  Mode class toggling — drives @prose-motions/styles.
// ---------------------------------------------------------------------------

describe('mode class on editor DOM', () => {
	const created: Editor[] = []

	function track(e: Editor): Editor {
		created.push(e)
		return e
	}

	afterEach(() => {
		while (created.length) created.pop()!.destroy()
		document.body.innerHTML = ''
	})

	it('starts in insert mode and carries pm-vim-mode-insert', () => {
		const editor = track(mountEditor('<p>hello</p>'))
		expect(editor.view.dom.classList.contains('pm-vim-mode-insert')).toBe(true)
		expect(editor.view.dom.classList.contains('pm-vim-mode-normal')).toBe(false)
	})

	it('swaps to pm-vim-mode-normal after Escape', () => {
		const editor = track(mountEditor('<p>hello</p>'))
		sendKeyStream(editor, '<Esc>')
		expect(editor.view.dom.classList.contains('pm-vim-mode-normal')).toBe(true)
		expect(editor.view.dom.classList.contains('pm-vim-mode-insert')).toBe(false)
	})

	it('returns to pm-vim-mode-insert when `i` is pressed in normal mode', () => {
		const editor = track(mountEditor('<p>hello</p>'))
		sendKeyStream(editor, '<Esc>')
		sendKeyStream(editor, 'i')
		expect(editor.view.dom.classList.contains('pm-vim-mode-insert')).toBe(true)
	})
})
