/**
 * A real Vim-style block cursor for the demo.
 *
 * In Normal / Visual mode the caret sits *on* the character and inverts its
 * colours (foreground ⇄ background), exactly like a terminal Vim. In Insert
 * mode it disappears and the editor's native thin caret takes over.
 *
 * prose-motions already toggles `.pm-vim-mode-*` classes on the editor DOM, but
 * the block itself is drawn as a ProseMirror decoration so it lands precisely on
 * the glyph (a CSS-only overlay can't invert the character underneath).
 *
 * This is written as a factory that takes the ProseMirror classes so the same
 * code can drive both the Tiptap editor (via `@tiptap/pm/*`) and the bare
 * ProseMirror editor (via `prosemirror-*`) without tripping over two copies of
 * the prosemirror-view module.
 */
export interface PMClasses {
	Plugin: any
	PluginKey: any
	Decoration: any
	DecorationSet: any
}

export interface BlockCursor {
	plugin: any
	/** Push the current vim mode so the decoration recomputes. */
	setMode: (view: any, mode: string) => void
}

export function createBlockCursor({ Plugin, PluginKey, Decoration, DecorationSet }: PMClasses): BlockCursor {
	const key = new PluginKey('demo-block-cursor')

	const plugin = new Plugin({
		key,
		state: {
			init: () => 'normal',
			apply(tr: any, value: string) {
				const meta = tr.getMeta(key)
				return typeof meta === 'string' ? meta : value
			},
		},
		props: {
			decorations(state: any) {
				const mode = key.getState(state) as string
				if (mode === 'insert')
					return DecorationSet.empty

				const sel = state.selection
				// While a visual selection is live the selection highlight is the
				// star of the show; only draw the block for an empty cursor.
				if (!sel.empty)
					return DecorationSet.empty

				const pos = sel.from
				const $pos = state.doc.resolve(pos)

				// Is there a character to the right within this text block?
				if ($pos.parent.inlineContent && pos < $pos.end()) {
					return DecorationSet.create(state.doc, [
						Decoration.inline(pos, pos + 1, { class: 'pm-block-cursor' }),
					])
				}

				// End of line / empty block — draw a hollow block widget instead.
				const widget = Decoration.widget(
					pos,
					() => {
						const span = document.createElement('span')
						span.className = 'pm-block-cursor pm-block-cursor--eol'
						span.textContent = ' '
						return span
					},
					{ side: 1 },
				)
				return DecorationSet.create(state.doc, [widget])
			},
		},
	})

	const setMode = (view: any, mode: string): void => {
		view.dispatch(view.state.tr.setMeta(key, mode))
	}

	return { plugin, setMode }
}
