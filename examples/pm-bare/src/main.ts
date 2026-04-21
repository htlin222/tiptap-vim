import { vimPlugins } from '@prose-motions/pm'
import { DOMParser } from 'prosemirror-model'
import { schema } from 'prosemirror-schema-basic'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import '@prose-motions/styles/vim.css'

const statusEl = document.getElementById('mode')!
const host = document.getElementById('editor')!

const seed = document.createElement('div')
seed.innerHTML = '<p>Hello from vanilla ProseMirror. Esc → h/j/k/l / b / dd.</p>'
const doc = DOMParser.fromSchema(schema).parse(seed)

const state = EditorState.create({
	doc,
	plugins: [
		...vimPlugins({
			defaultMode: 'normal',
			onModeChange: (mode) => {
				statusEl.textContent = `mode: ${mode}`
			},
		}),
	],
})

// eslint-disable-next-line no-new
new EditorView(host, { state })
statusEl.textContent = 'mode: normal'
