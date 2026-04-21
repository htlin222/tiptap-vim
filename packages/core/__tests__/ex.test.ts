import { VimMode } from '@prose-motions/core'
import { sendKeyStream } from '@prose-motions/testing'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
//  M5 ex-command acceptance — `:w` fires a user-supplied handler.
// ---------------------------------------------------------------------------

describe('ex commands via config', () => {
	const created: Editor[] = []

	function mount(opts: Parameters<typeof VimMode.configure>[0]): Editor {
		const host = document.createElement('div')
		document.body.appendChild(host)
		const editor = new Editor({
			element: host,
			extensions: [StarterKit, VimMode.configure(opts)],
			content: '<p>hello</p>',
		})
		created.push(editor)
		return editor
	}

	afterEach(() => {
		while (created.length) created.pop()!.destroy()
		document.body.innerHTML = ''
	})

	it('invokes the user-supplied `:w` handler', () => {
		const save = vi.fn()
		const editor = mount({ ex: { handlers: { w: save } } })
		editor.commands.enterNormalMode()

		// Open the ex prompt.
		sendKeyStream(editor, ':')

		// Find the dialog input that openDialog rendered, fill it, submit.
		const input = document.querySelector('.pm-vim-dialog input') as HTMLInputElement | null
		expect(input).not.toBeNull()
		input!.value = 'w'
		input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

		expect(save).toHaveBeenCalledTimes(1)
	})

	it('falls back to onUnknown when a handler returns false', () => {
		const decline = vi.fn().mockReturnValue(false)
		const onUnknown = vi.fn()
		const editor = mount({ ex: { handlers: { w: decline }, onUnknown } })
		editor.commands.enterNormalMode()

		sendKeyStream(editor, ':')
		const input = document.querySelector('.pm-vim-dialog input') as HTMLInputElement | null
		input!.value = 'w'
		input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

		expect(decline).toHaveBeenCalledTimes(1)
		expect(onUnknown).toHaveBeenCalledTimes(1)
	})

	it('passes the full input and argv to the handler', () => {
		const write = vi.fn()
		const editor = mount({ ex: { handlers: { w: write } } })
		editor.commands.enterNormalMode()

		sendKeyStream(editor, ':')
		const input = document.querySelector('.pm-vim-dialog input') as HTMLInputElement | null
		input!.value = 'w report.md'
		input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

		expect(write).toHaveBeenCalledTimes(1)
		const call = write.mock.calls[0]
		expect(call[1].input).toContain('report.md')
		expect(call[1].argv).toContain('report.md')
	})
})
