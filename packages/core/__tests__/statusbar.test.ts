import type { Editor } from '@tiptap/core'
import { mountStatusBar } from '@prose-motions/statusbar-vanilla'
import { mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
//  M5 acceptance: status bar reflects mode transitions.
// ---------------------------------------------------------------------------

describe('statusbar-vanilla', () => {
	const created: Editor[] = []

	afterEach(() => {
		while (created.length) created.pop()!.destroy()
		document.body.innerHTML = ''
	})

	it('renders the current mode and updates on Escape / i', () => {
		const editor = mountEditor('<p>hello</p>')
		created.push(editor)
		const host = document.createElement('div')
		document.body.appendChild(host)
		const bar = mountStatusBar(host, editor)

		// Boot mode is `insert` per v0.1.7 parity.
		expect(host.textContent).toContain('INSERT')

		sendKeyStream(editor, '<Esc>')
		expect(host.textContent).toContain('NORMAL')

		sendKeyStream(editor, 'v')
		expect(host.textContent).toContain('VISUAL')

		sendKeyStream(editor, '<Esc>i')
		expect(host.textContent).toContain('INSERT')

		bar.destroy()
		expect(host.textContent).toBe('')
	})
})
