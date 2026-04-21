import type { Editor } from '@tiptap/core'
import { mountEditor, runMotion, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
//  Golden-doc motion suite — every case below runs against the real engine
//  via @prose-motions/adapter. Failures here point at missing or mis-wired
//  adapter methods rather than at the engine.
//
//  All tests park the caret *after* entering normal mode, so the engine's
//  mode-transition cursor shift never changes the starting position.
// ---------------------------------------------------------------------------

describe('motions, engine-driven', () => {
	const created: Editor[] = []

	function track(e: Editor): Editor {
		created.push(e)
		return e
	}

	afterEach(() => {
		while (created.length) {
			const e = created.pop()!
			e.destroy()
		}
		document.body.innerHTML = ''
	})

	// — counts & horizontal motions ———————————————————————————————
	it('`3l` moves the caret three chars right', () => {
		// caret on 'a' (pm 1) → 3l → on 'd' (pm 4)
		const { editor, finalPos } = runMotion('<p>abcdef</p>', 1, '3l')
		track(editor)
		expect(finalPos).toBe(4)
	})

	it('`5h` clamps at start of line', () => {
		const { editor, finalPos } = runMotion('<p>abcdef</p>', 3, '5h')
		track(editor)
		expect(finalPos).toBe(1)
	})

	it('`$` jumps to end of line', () => {
		// "Hello world" pm 1..11; '$' parks on last char → pm 11
		const { editor, finalPos } = runMotion('<p>Hello world</p>', 2, '$')
		track(editor)
		expect(finalPos).toBe(11)
	})

	it('`0` jumps to start of line', () => {
		const { editor, finalPos } = runMotion('<p>Hello world</p>', 8, '0')
		track(editor)
		expect(finalPos).toBe(1)
	})

	// — word motions ————————————————————————————————————————————
	it('`w` moves to start of next word', () => {
		// caret on 'f' of "foo" → w → on 'b' of "bar" (pm 5)
		const { editor, finalPos } = runMotion('<p>foo bar baz</p>', 1, 'w')
		track(editor)
		expect(finalPos).toBe(5)
	})

	it('`3w` moves three words forward', () => {
		// "foo bar baz qux" → foo→bar→baz→qux : 'q' at pm 13
		const { editor, finalPos } = runMotion('<p>foo bar baz qux</p>', 1, '3w')
		track(editor)
		expect(finalPos).toBe(13)
	})

	it('`b` moves to start of previous word', () => {
		// caret on 'b' of "baz" (pm 9) → b → 'b' of "bar" (pm 5)
		const { editor, finalPos } = runMotion('<p>foo bar baz</p>', 9, 'b')
		track(editor)
		expect(finalPos).toBe(5)
	})

	it('`e` moves to end of current word', () => {
		// caret on 'f' of "foo" → e → on last 'o' (pm 3)
		const { editor, finalPos } = runMotion('<p>foo bar</p>', 1, 'e')
		track(editor)
		expect(finalPos).toBe(3)
	})

	// — document jumps ————————————————————————————————————————————
	it('`G` jumps to the last line', () => {
		const { editor } = runMotion('<p>one</p><p>two</p><p>three</p>', 2, 'G')
		track(editor)
		// Cursor should sit inside the "three" paragraph.
		const pos = editor.state.selection.$head.pos
		expect(pos).toBeGreaterThan(editor.state.doc.content.size - 7)
	})

	it('`gg` jumps to the first line', () => {
		const { editor, finalPos } = runMotion(
			'<p>one</p><p>two</p><p>three</p>',
			14,
			'gg',
		)
		track(editor)
		expect(finalPos).toBe(1)
	})

	// — find char ————————————————————————————————————————————————
	it('`fX` jumps to next occurrence of X on the line', () => {
		// 'w' is index 6 in "Hello world" → pm 7
		const { editor, finalPos } = runMotion('<p>Hello world</p>', 1, 'fw')
		track(editor)
		expect(finalPos).toBe(7)
	})

	// — operators ———————————————————————————————————————————————
	it('`dw` deletes a word', () => {
		const editor = track(mountEditor('<p>foo bar baz</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1) // on 'f'
		sendKeyStream(editor, 'dw')
		expect(editor.getHTML()).toBe('<p>bar baz</p>')
	})

	it('`yy` then `p` duplicates the current line', () => {
		const editor = track(mountEditor('<p>first</p><p>second</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(2)
		sendKeyStream(editor, 'yyp')
		const html = editor.getHTML()
		// Duplication is the invariant — exact markup may vary.
		expect(html.split('first').length).toBe(3)
	})

	it('`.` repeats the last edit', () => {
		const editor = track(mountEditor('<p>foo bar baz</p>'))
		editor.commands.enterNormalMode()
		editor.commands.setTextSelection(1)
		sendKeyStream(editor, 'dw')
		expect(editor.getHTML()).toBe('<p>bar baz</p>')
		sendKeyStream(editor, '.')
		expect(editor.getHTML()).toBe('<p>baz</p>')
	})
})
