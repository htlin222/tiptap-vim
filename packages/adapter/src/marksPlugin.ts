import type { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface MarkSpec {
	className?: string
	css?: string
	/** Mark removes itself when the caret enters the range. */
	clearOnEnter?: boolean
}

export interface MarkHandle {
	readonly id: number
	clear: () => void
	find: () => { from: number, to: number } | null
}

interface InternalMark {
	id: number
	from: number
	to: number
	spec: MarkSpec
}

interface PluginState {
	marks: Map<number, InternalMark>
	deco: DecorationSet
}

export const marksPluginKey = new PluginKey<PluginState>('prose-motions/marks')

interface AddMeta {
	type: 'add'
	mark: InternalMark
}

interface RemoveMeta {
	type: 'remove'
	id: number
}

interface ClearMeta {
	type: 'clear'
}

type MarksMeta = AddMeta | RemoveMeta | ClearMeta

let markIdCounter = 0

/**
 * One ProseMirror plugin per editor that turns CodeMirror-style `markText`
 * handles into `Decoration` instances. Decorations survive edits because the
 * plugin state goes through `mapping` on every transaction — the mark's
 * absolute positions are re-derived from the original range rebased onto the
 * new document.
 */
export function marksPlugin(): Plugin<PluginState> {
	return new Plugin<PluginState>({
		key: marksPluginKey,
		state: {
			init(): PluginState {
				return { marks: new Map(), deco: DecorationSet.empty }
			},
			apply(tr, prev): PluginState {
				const meta = tr.getMeta(marksPluginKey) as MarksMeta | undefined
				let marks = prev.marks
				let deco = prev.deco

				if (tr.docChanged) {
					// Remap both the decoration set and the tracked mark bounds.
					deco = deco.map(tr.mapping, tr.doc)
					const next = new Map<number, InternalMark>()
					for (const [id, m] of marks) {
						const from = tr.mapping.map(m.from, 1)
						const to = tr.mapping.map(m.to, -1)
						if (from < to)
							next.set(id, { ...m, from, to })
					}
					marks = next
				}

				if (meta) {
					switch (meta.type) {
						case 'add': {
							marks = new Map(marks).set(meta.mark.id, meta.mark)
							deco = deco.add(tr.doc, [buildDecoration(meta.mark)])
							break
						}
						case 'remove': {
							const existing = marks.get(meta.id)
							if (existing) {
								marks = new Map(marks)
								marks.delete(meta.id)
								const found = deco.find(existing.from, existing.to)
								deco = deco.remove(found)
							}
							break
						}
						case 'clear': {
							marks = new Map()
							deco = DecorationSet.empty
							break
						}
					}
				}

				return { marks, deco }
			},
		},
		props: {
			decorations(state) {
				return marksPluginKey.getState(state)?.deco
			},
		},
	})
}

function buildDecoration(mark: InternalMark): Decoration {
	const attrs: { class?: string, style?: string } = {}
	if (mark.spec.className)
		attrs.class = mark.spec.className
	if (mark.spec.css)
		attrs.style = mark.spec.css
	return Decoration.inline(mark.from, mark.to, attrs, { id: mark.id })
}

/**
 * Register a new mark spanning `from`..`to` (absolute PM positions) on the
 * given view. Returns a handle whose `find()` re-reads the current position
 * from plugin state and `clear()` dispatches a meta-transaction to remove it.
 */
export function addMark(view: EditorView, from: number, to: number, spec: MarkSpec = {}): MarkHandle {
	const id = ++markIdCounter
	const mark: InternalMark = { id, from, to, spec }
	view.dispatch(view.state.tr.setMeta(marksPluginKey, { type: 'add', mark } satisfies AddMeta))
	return {
		id,
		clear() {
			view.dispatch(view.state.tr.setMeta(marksPluginKey, { type: 'remove', id } satisfies RemoveMeta))
		},
		find() {
			const st = marksPluginKey.getState(view.state)
			const m = st?.marks.get(id)
			return m ? { from: m.from, to: m.to } : null
		},
	}
}

/** Remove every mark on the view. Handy for teardown or theme switches. */
export function clearMarks(view: EditorView): void {
	view.dispatch(view.state.tr.setMeta(marksPluginKey, { type: 'clear' } satisfies ClearMeta))
}
