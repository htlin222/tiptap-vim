import type { CMVimAdapter } from './CMVimAdapter'
import { Vim } from '@prose-motions/engine'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface VimKeymapOptions {
	/**
	 * Resolves the adapter bound to the current EditorView. Called on every
	 * keydown so lazy/post-init setup paths (e.g. plugin view() hooks) work.
	 */
	getAdapter: () => CMVimAdapter
	/** Returns the current vim mode. The plugin only forwards keys when mode !== 'insert'. */
	getMode: () => string
}

export const vimKeymapPluginKey = new PluginKey('prose-motions/vim-keymap')

const NAMED_KEYS: Record<string, string> = {
	'Escape': 'Esc',
	'Enter': 'CR',
	'Tab': 'Tab',
	'Backspace': 'BS',
	'Delete': 'Del',
	'ArrowLeft': 'Left',
	'ArrowRight': 'Right',
	'ArrowUp': 'Up',
	'ArrowDown': 'Down',
	'Home': 'Home',
	'End': 'End',
	'PageUp': 'PageUp',
	'PageDown': 'PageDown',
	' ': 'Space',
	'F1': 'F1',
	'F2': 'F2',
	'F3': 'F3',
	'F4': 'F4',
	'F5': 'F5',
	'F6': 'F6',
	'F7': 'F7',
	'F8': 'F8',
	'F9': 'F9',
	'F10': 'F10',
	'F11': 'F11',
	'F12': 'F12',
}

/**
 * Single high-priority PM plugin that routes keydown events to the engine in
 * Normal / Visual modes and yields in Insert mode so Tiptap handles typing.
 *
 * - IME composition is always passed through.
 * - Keys that the engine declines (`Vim.handleKey` returns `false`/`undefined`)
 *   fall through to the rest of the PM plugin stack.
 */
export function vimKeymapPlugin({ getAdapter, getMode }: VimKeymapOptions): Plugin {
	return new Plugin({
		key: vimKeymapPluginKey,
		props: {
			handleKeyDown(_view, event) {
				if (event.isComposing || event.keyCode === 229)
					return false
				if (getMode() === 'insert' && event.key !== 'Escape')
					return false

				const key = toVimKey(event)
				if (!key)
					return false

				const handled = Vim.handleKey(getAdapter() as unknown as never, key, 'user')
				if (handled) {
					event.preventDefault()
					return true
				}
				return false
			},
			handleTextInput() {
				return getMode() !== 'insert'
			},
		},
	})
}

/**
 * Translate a DOM KeyboardEvent into the `<Mod-Key>` notation the vim engine
 * expects. Modifier-free printable keys come through as themselves
 * (`event.key`); control-ish keys get the `<…>` wrapping.
 */
function toVimKey(event: KeyboardEvent): string | null {
	const { key } = event
	if (!key)
		return null

	const mods: string[] = []
	if (event.ctrlKey)
		mods.push('C')
	if (event.metaKey)
		mods.push('M')
	if (event.altKey)
		mods.push('A')
	const hasShift = event.shiftKey

	const named = NAMED_KEYS[key]

	if (named) {
		const parts = [...mods]
		if (hasShift && named !== 'Space')
			parts.push('S')
		const inner = parts.length ? `${parts.join('-')}-${named}` : named
		return `<${inner}>`
	}

	if (key.length === 1) {
		if (!mods.length)
			return key
		const parts = [...mods]
		if (hasShift)
			parts.push('S')
		return `<${parts.join('-')}-${key.toLowerCase()}>`
	}

	// Unknown multi-char key (Dead, Compose, …) — let PM handle.
	return null
}
