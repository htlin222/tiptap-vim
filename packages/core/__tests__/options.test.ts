import { VimMode } from '@prose-motions/core'
import { sendKeyStream } from '@prose-motions/testing'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
//  M6 configuration surface — defaultMode, onModeChange.
// ---------------------------------------------------------------------------

describe('vimModeOptions', () => {
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

	it('`defaultMode: "normal"` boots in normal mode', () => {
		const editor = mount({ defaultMode: 'normal' })
		expect(editor.storage.vimMode.state.mode).toBe('normal')
	})

	it('`defaultMode: "insert"` boots in insert mode', () => {
		const editor = mount({ defaultMode: 'insert' })
		expect(editor.storage.vimMode.state.mode).toBe('insert')
	})

	it('`onModeChange` fires with the current mode', () => {
		const onModeChange = vi.fn()
		const editor = mount({ onModeChange })
		sendKeyStream(editor, '<Esc>')
		expect(onModeChange).toHaveBeenCalledWith('normal')
		sendKeyStream(editor, 'v')
		expect(onModeChange).toHaveBeenCalledWith('visual')
		sendKeyStream(editor, '<Esc>i')
		expect(onModeChange).toHaveBeenLastCalledWith('insert')
	})
})
