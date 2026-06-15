import { mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// Regression: linewise operators that run off the end of the document. The
// engine expresses "one line past line L" as Pos(L+1, 0); for the last/only
// line that overflows the LineIndex. It used to clamp to the start of the last
// line, turning `dd` on the last line into a paragraph-join and `dd` on the
// only line into a no-op. See LineIndex.clamp (CodeMirror clipPos semantics).

const editors: { destroy: () => void }[] = []
afterEach(() => {
	for (const e of editors.splice(0)) e.destroy()
})

function run(html: string, caret: number, keys: string): string {
	const editor = mountEditor(html)
	editors.push(editor)
	editor.commands.enterNormalMode()
	editor.commands.setTextSelection(caret)
	sendKeyStream(editor, keys)
	return editor.getHTML()
}

describe('linewise delete at the end of the document', () => {
	it('dd on the FIRST of two paragraphs', () => {
		expect(run('<p>alpha</p><p>bravo</p>', 2, 'dd')).toBe('<p>bravo</p>')
	})

	it('dd on the LAST of two paragraphs', () => {
		expect(run('<p>alpha</p><p>bravo</p>', 9, 'dd')).toBe('<p>alpha</p>')
	})

	it('dd on the ONLY paragraph clears it', () => {
		expect(run('<p>hello world</p>', 2, 'dd')).toBe('<p></p>')
	})

	it('dd twice on a two-line doc clears it', () => {
		expect(run('<p>alpha</p><p>bravo</p>', 2, 'dddd')).toBe('<p></p>')
	})

	it('cc on the only paragraph leaves an empty line', () => {
		// change-line on the last line must not join/no-op either
		expect(run('<p>hello</p>', 2, 'cc')).toBe('<p></p>')
	})

	it('dG to end of document from the first of three lines', () => {
		expect(run('<p>one</p><p>two</p><p>three</p>', 2, 'dG')).toBe('<p></p>')
	})
})
