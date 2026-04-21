import type { Editor } from '@tiptap/core'
import { mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
//  Visual-mode golden suite — M4.
//
//  Validates:
//    - `v` enters visual mode and extends the selection
//    - `V` enters linewise visual
//    - operators on visual ranges: y, d, c
//    - the acceptance case: V + j + d across three paragraphs
// ---------------------------------------------------------------------------

describe('visual mode', () => {
	const created: Editor[] = []

	function track(e: Editor): Editor {
		created.push(e)
		return e
	}

	afterEach(() => {
		while (created.length) created.pop()!.destroy()
		document.body.innerHTML = ''
	})

	it('`v` transitions to visual mode', () => {
		const editor = track(mountEditor('<p>hello</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1)
		sendKeyStream(editor, 'v')
		expect(editor.storage.vimMode.state.mode).toBe('visual')
		expect(editor.view.dom.classList.contains('pm-vim-mode-visual')).toBe(true)
	})

	it('`vl` selects one character', () => {
		const editor = track(mountEditor('<p>hello</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1)
		sendKeyStream(editor, 'vl')
		const sel = editor.state.selection
		expect(Math.abs(sel.to - sel.from)).toBeGreaterThan(0)
	})

	it('`viw` selects the whole word', () => {
		const editor = track(mountEditor('<p>foo bar baz</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(6) // inside "bar"
		sendKeyStream(editor, 'viw')
		// Selection should cover "bar" (3 chars).
		const sel = editor.state.selection
		expect(sel.to - sel.from).toBe(3)
	})

	it('`vwd` deletes from cursor through start of next word (inclusive)', () => {
		const editor = track(mountEditor('<p>foo bar baz</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1)
		// `v` starts visual at 'f'. `w` extends head to start of next word,
		// landing on 'b'. Visual is inclusive, so `d` deletes "foo b" → leaves
		// "ar baz".
		sendKeyStream(editor, 'vwd')
		expect(editor.getHTML()).toBe('<p>ar baz</p>')
		expect(editor.storage.vimMode.state.mode).toBe('normal')
	})

	it('`vly` yanks a couple characters, `p` pastes after cursor', () => {
		const editor = track(mountEditor('<p>abcdef</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1) // on 'a'
		sendKeyStream(editor, 'vly')
		// Move right a few, then paste.
		sendKeyStream(editor, 'llp')
		// "abcdef" → yanked "ab", pasted after cursor.
		const html = editor.getHTML()
		expect(html).toContain('ab')
		// Invariant: the doc got longer by exactly the paste length.
		expect(editor.state.doc.textContent.length).toBe(8)
	})

	it('`V` enters visual-line mode', () => {
		const editor = track(mountEditor('<p>alpha</p><p>beta</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(2)
		sendKeyStream(editor, 'V')
		expect(editor.storage.vimMode.state.mode).toBe('visual')
	})

	it('`Vjd` deletes the current + next line across block boundaries', () => {
		const editor = track(mountEditor('<p>alpha</p><p>beta</p><p>gamma</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(2) // inside "alpha"
		sendKeyStream(editor, 'Vjd')
		// Lines "alpha" and "beta" should be gone, "gamma" should remain.
		const html = editor.getHTML()
		expect(html).not.toContain('alpha')
		expect(html).not.toContain('beta')
		expect(html).toContain('gamma')
		expect(editor.storage.vimMode.state.mode).toBe('normal')
	})
})
