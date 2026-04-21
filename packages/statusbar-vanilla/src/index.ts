import type { Editor } from '@tiptap/core'
import { vimAdapterOf } from '@prose-motions/core'

export interface StatusBarHandle {
	/** Re-render from the adapter's current state. Usually not needed. */
	refresh: () => void
	/** Unsubscribe from mode events and remove the rendered DOM. */
	destroy: () => void
}

export interface StatusBarOptions {
	/** Override the label shown per mode. Defaults: `-- INSERT --`, etc. */
	labels?: Partial<Record<'normal' | 'insert' | 'visual', string>>
	/** Root class name on the rendered element. Defaults to `pm-vim-statusbar`. */
	className?: string
}

const DEFAULT_LABELS = {
	normal: '-- NORMAL --',
	insert: '-- INSERT --',
	visual: '-- VISUAL --',
}

/**
 * Mount a minimal vim-style status bar into `target`. Shows the current mode
 * and mirrors changes by subscribing to the engine's `vim-mode-change`
 * signal via the adapter. Returns a handle with `destroy()`; call it on
 * teardown to remove listeners and DOM.
 */
export function mountStatusBar(
	target: HTMLElement,
	editor: Editor,
	options: StatusBarOptions = {},
): StatusBarHandle {
	const labels = { ...DEFAULT_LABELS, ...options.labels }
	const rootClass = options.className ?? 'pm-vim-statusbar'

	const root = document.createElement('div')
	root.className = rootClass
	root.setAttribute('role', 'status')
	root.setAttribute('aria-live', 'polite')

	const modeEl = document.createElement('span')
	modeEl.className = `${rootClass}__mode`
	root.appendChild(modeEl)

	target.appendChild(root)

	const render = (): void => {
		const storage = editor.storage as { vimMode?: { state?: { mode?: keyof typeof labels } } }
		const mode = storage.vimMode?.state?.mode ?? 'insert'
		modeEl.textContent = labels[mode] ?? mode
		modeEl.dataset.mode = mode
	}

	const adapter = vimAdapterOf(editor)
	const onChange = (): void => render()
	adapter?.on('vim-mode-change', onChange)

	// Also refresh on every PM transaction — covers mode writes that happen
	// outside the engine (e.g. enterInsertMode command without an engine
	// signal) and keeps the bar in sync with selection-driven state.
	editor.on('transaction', render)

	render()

	return {
		refresh: render,
		destroy() {
			editor.off('transaction', render)
			adapter?.off('vim-mode-change', onChange)
			root.remove()
		},
	}
}
