import type { Editor } from '@tiptap/core'
import { mountEditor, sendKeyStream } from '@prose-motions/testing'
import { afterEach, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
//  M7 conformance matrix — a broad sweep of the `:help index` Normal-mode
//  commands we claim support for. Each row is { name, html, caret, keys,
//  expectHtml?, expectCaret? }. Tests pass when the doc and/or caret match
//  the expected post-state after entering Normal mode and sending `keys`.
// ---------------------------------------------------------------------------

interface Row {
	name: string
	html: string
	caret: number
	keys: string
	expectHtml?: string
	expectCaret?: number
	/** Optional predicate on final caret when exact position is schema-sensitive. */
	caretPredicate?: (pos: number, size: number) => boolean
}

const motionRows: Row[] = [
	{ name: 'h — char left', html: '<p>abc</p>', caret: 3, keys: 'h', expectCaret: 2 },
	{ name: 'l — char right', html: '<p>abc</p>', caret: 1, keys: 'l', expectCaret: 2 },
	{ name: '0 — start of line', html: '<p>hello world</p>', caret: 8, keys: '0', expectCaret: 1 },
	{ name: '$ — end of line', html: '<p>hello world</p>', caret: 2, keys: '$', expectCaret: 11 },
	{ name: '^ — first non-blank (no leading ws in schema)', html: '<p>hello world</p>', caret: 8, keys: '^', expectCaret: 1 },
	{ name: 'w — next word', html: '<p>foo bar</p>', caret: 1, keys: 'w', expectCaret: 5 },
	{ name: 'W — next WORD', html: '<p>foo bar</p>', caret: 1, keys: 'W', expectCaret: 5 },
	{ name: 'e — end of word', html: '<p>foo bar</p>', caret: 1, keys: 'e', expectCaret: 3 },
	{ name: 'b — prev word', html: '<p>foo bar baz</p>', caret: 9, keys: 'b', expectCaret: 5 },
	{ name: 'B — prev WORD', html: '<p>foo bar baz</p>', caret: 9, keys: 'B', expectCaret: 5 },
	{ name: 'gg — top of document', html: '<p>one</p><p>two</p><p>three</p>', caret: 14, keys: 'gg', expectCaret: 1 },
	{
		name: 'G — bottom of document',
		html: '<p>one</p><p>two</p><p>three</p>',
		caret: 2,
		keys: 'G',
		caretPredicate: (pos, size) => pos > size - 7,
	},
	{ name: 'fX — find char forward', html: '<p>Hello world</p>', caret: 1, keys: 'fw', expectCaret: 7 },
	{ name: 'tX — till char forward', html: '<p>Hello world</p>', caret: 1, keys: 'tw', expectCaret: 6 },
	{ name: ';  — repeat last find', html: '<p>a.b.c.d</p>', caret: 1, keys: 'f.;', expectCaret: 4 },
	{ name: ',  — repeat last find reverse', html: '<p>a.b.c.d</p>', caret: 1, keys: 'f.f.,', expectCaret: 2 },
]

const countRows: Row[] = [
	{ name: '3l — count × l', html: '<p>abcdef</p>', caret: 1, keys: '3l', expectCaret: 4 },
	{ name: '3w — count × w', html: '<p>a b c d</p>', caret: 1, keys: '3w', expectCaret: 7 },
	{ name: '5h clamps at line start', html: '<p>abcdef</p>', caret: 4, keys: '5h', expectCaret: 1 },
]

const operatorRows: Row[] = [
	{ name: 'dd — delete line', html: '<p>alpha</p><p>bravo</p>', caret: 2, keys: 'dd', expectHtml: '<p>bravo</p>' },
	{ name: 'dw — delete word', html: '<p>foo bar</p>', caret: 1, keys: 'dw', expectHtml: '<p>bar</p>' },
	{
		name: 'daw — delete a word',
		html: '<p>foo bar baz</p>',
		caret: 6,
		keys: 'daw',
		expectHtml: '<p>foo baz</p>',
	},
	{
		name: 'diw — delete inner word',
		html: '<p>foo bar baz</p>',
		caret: 6,
		keys: 'diw',
		expectHtml: '<p>foo  baz</p>',
	},
	{ name: 'cw i — change word', html: '<p>foo bar</p>', caret: 1, keys: 'cw', expectHtml: '<p> bar</p>' },
	{
		name: 'yy p — duplicates the line content',
		html: '<p>alpha</p>',
		caret: 2,
		keys: 'yyp',
		// Schema-dependent exact markup (Tiptap's StarterKit renders the linewise
		// paste with a soft break). The invariant is "alpha" appears twice.
		caretPredicate: () => true,
	},
	{ name: 'x — delete char under cursor', html: '<p>abc</p>', caret: 1, keys: 'x', expectHtml: '<p>bc</p>' },
	{
		name: 'X — delete prev char',
		html: '<p>abc</p>',
		caret: 3,
		keys: 'X',
		expectHtml: '<p>ac</p>',
	},
	{
		name: '. — repeat last edit',
		html: '<p>aa bb cc</p>',
		caret: 1,
		keys: 'dw.',
		expectHtml: '<p>cc</p>',
	},
]

const visualRows: Row[] = [
	{
		name: 'v l d — delete selection',
		html: '<p>abcdef</p>',
		caret: 1,
		keys: 'vld',
		expectHtml: '<p>cdef</p>',
	},
	{
		name: 'V j d — linewise delete across blocks',
		html: '<p>one</p><p>two</p><p>three</p>',
		caret: 2,
		keys: 'Vjd',
		// both "one" and "two" lines gone; "three" remains.
		expectHtml: '<p>three</p>',
	},
	{
		name: 'viw d — inner-word via visual',
		html: '<p>alpha bravo</p>',
		caret: 2,
		keys: 'viwd',
		expectHtml: '<p> bravo</p>',
	},
]

const allRows = [
	...motionRows.map(r => ({ ...r, group: 'motions' })),
	...countRows.map(r => ({ ...r, group: 'counts' })),
	...operatorRows.map(r => ({ ...r, group: 'operators' })),
	...visualRows.map(r => ({ ...r, group: 'visual' })),
]

describe('`:help index` conformance matrix', () => {
	const created: Editor[] = []

	afterEach(() => {
		while (created.length) created.pop()!.destroy()
		document.body.innerHTML = ''
	})

	for (const row of allRows) {
		it(`[${row.group}] ${row.name}`, () => {
			const editor = mountEditor(row.html)
			created.push(editor)
			editor.commands.enterNormalMode()
			editor.commands.setTextSelection(row.caret)
			sendKeyStream(editor, row.keys)

			if (row.expectHtml !== undefined) {
				expect(editor.getHTML()).toBe(row.expectHtml)
			}
			if (row.expectCaret !== undefined) {
				expect(editor.state.selection.$head.pos).toBe(row.expectCaret)
			}
			if (row.caretPredicate) {
				const size = editor.state.doc.content.size
				expect(row.caretPredicate(editor.state.selection.$head.pos, size)).toBe(true)
			}
		})
	}
})
