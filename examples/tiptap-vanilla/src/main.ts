import { VimMode } from '@prose-motions/core'
import { vimPlugins } from '@prose-motions/pm'
import { Editor } from '@tiptap/core'
import { history } from '@tiptap/pm/history'
import { Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { DOMParser } from 'prosemirror-model'
import { EditorState, Plugin as PMPlugin, PluginKey as PMPluginKey } from 'prosemirror-state'
import { Decoration as PMDecoration, DecorationSet as PMDecorationSet, EditorView } from 'prosemirror-view'
import '@prose-motions/styles/vim.css'
import './demo.css'
import { createBlockCursor } from './block-cursor'

type Mode = 'normal' | 'insert' | 'visual'

function paintStatus(el: HTMLElement, mode: Mode): void {
	el.dataset.mode = mode
	el.textContent = mode.toUpperCase()
}

// ── Tiptap editor (plain text — formatting marks/blocks disabled) ────────────
const tiptapBlock = createBlockCursor({ Plugin, PluginKey, Decoration, DecorationSet })
const tiptapStatus = document.getElementById('status-tiptap')!

let tiptap: Editor
tiptap = new Editor({
	element: document.getElementById('editor-tiptap')!,
	extensions: [
		// Plain-text editing: keep paragraphs + history, drop every styling
		// node/mark so this behaves like a Vim buffer, not a rich-text editor.
		StarterKit.configure({
			heading: false,
			bold: false,
			italic: false,
			strike: false,
			code: false,
			codeBlock: false,
			blockquote: false,
			bulletList: false,
			orderedList: false,
			listItem: false,
			horizontalRule: false,
		}),
		VimMode.configure({
			defaultMode: 'normal',
			onModeChange: (mode) => {
				paintStatus(tiptapStatus, mode as Mode)
				tiptapBlock.setMode(tiptap.view, mode)
			},
		}),
	],
	content: `
		<p>The quick brown fox jumps over the lazy dog.</p>
		<p>Press i to insert, Esc to go back to Normal. Move with h j k l, w, b, 0, $. Open lines with o and O.</p>
		<p>Operators compose: dd dw diw ciw yy p, and . to repeat. Try 2dd or 3w. Undo with u, redo with Ctrl-r.</p>
		<p>This is a deliberately long line that wraps across several display rows so you can feel the difference between j/k (whole paragraph) and gj/gk, which step one wrapped screen row at a time — try it here.</p>
	`,
})
tiptap.registerPlugin(tiptapBlock.plugin)
paintStatus(tiptapStatus, 'normal')
tiptapBlock.setMode(tiptap.view, 'normal')

// ── Bare ProseMirror editor (plain-text schema + history) ────────────────────
const pmBlock = createBlockCursor({
	Plugin: PMPlugin,
	PluginKey: PMPluginKey,
	Decoration: PMDecoration,
	DecorationSet: PMDecorationSet,
})
const pmStatus = document.getElementById('status-pm')!

// A minimal plain-text schema: paragraphs of text, no marks, no headings.
const plainSchema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: {
			group: 'block',
			content: 'inline*',
			parseDOM: [{ tag: 'p' }],
			toDOM: () => ['p', 0],
		},
		text: { group: 'inline' },
	},
	marks: {},
})

const seed = document.createElement('div')
seed.innerHTML
	= '<p>Same engine, no Tiptap — just vanilla ProseMirror, plain text.</p>'
	+ '<p>Every motion, operator and text-object behaves identically here.</p>'
	+ '<p>State is per-editor: a pending d here never arms dd above.</p>'
const doc = DOMParser.fromSchema(plainSchema).parse(seed)

let pmView: EditorView
const pmState = EditorState.create({
	doc,
	plugins: [
		// History from @tiptap/pm/history so the adapter's undo/redo (same
		// module) can drive it — without this, `u` has nothing to undo here.
		history(),
		...vimPlugins({
			defaultMode: 'normal',
			onModeChange: (mode) => {
				paintStatus(pmStatus, mode as Mode)
				pmBlock.setMode(pmView, mode)
			},
		}),
		pmBlock.plugin,
	],
})
pmView = new EditorView(document.getElementById('editor-pm')!, { state: pmState })
paintStatus(pmStatus, 'normal')
pmBlock.setMode(pmView, 'normal')

// Focus the Tiptap editor so the demo is keyboard-ready on load.
tiptap.commands.focus()
