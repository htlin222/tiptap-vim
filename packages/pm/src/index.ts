import type { EditorView } from 'prosemirror-view'
import { CMVimAdapter, marksPlugin, vimKeymapPlugin } from '@prose-motions/adapter'
import { Vim } from '@prose-motions/engine'
import { Plugin, PluginKey } from 'prosemirror-state'

// ---------------------------------------------------------------------------
//  Public types — mirror the Tiptap extension's surface, minus the Tiptap
//  Commands declaration-merging bits that wouldn't apply here.
// ---------------------------------------------------------------------------

export type Mode = 'normal' | 'insert' | 'visual'

export type ExHandler = (
	cm: CMVimAdapter,
	args: { input: string, argv: string[] }
) => void | boolean

export interface KeyMapping {
	lhs: string
	rhs: string
	mode?: Mode
}

export interface VimPluginOptions {
	defaultMode?: 'normal' | 'insert'
	keymaps?: KeyMapping[]
	ex?: {
		handlers?: Record<string, ExHandler>
		onUnknown?: ExHandler
	}
	clipboard?: 'internal' | 'system'
	onModeChange?: (mode: Mode) => void
	/** If provided, this element gets the `.pm-vim-mode-*` class; defaults to `view.dom`. */
	modeClassTarget?: (view: EditorView) => HTMLElement
}

const adapterByView = new WeakMap<EditorView, CMVimAdapter>()
const globallyDefinedEx = new Set<string>()
const appliedMaps = new Set<string>()

interface EditorRegistry {
	handlers: Record<string, ExHandler>
	onUnknown?: ExHandler
}
const registryByAdapter = new WeakMap<CMVimAdapter, EditorRegistry>()

function modeOf(adapter: CMVimAdapter | undefined): Mode {
	const vim = (adapter?.state.vim ?? null) as {
		insertMode?: boolean
		visualMode?: boolean
	} | null
	if (vim?.insertMode)
		return 'insert'
	if (vim?.visualMode)
		return 'visual'
	return 'normal'
}

function ensureExDispatcher(name: string): void {
	if (globallyDefinedEx.has(name))
		return
	Vim.defineEx(name, name, (cm: unknown, params: unknown) => {
		const adapter = cm as CMVimAdapter
		const entry = registryByAdapter.get(adapter)
		const raw = (params as { input?: string, args?: string[] } | undefined) ?? {}
		const input = typeof raw.input === 'string' ? raw.input : ''
		const argv = Array.isArray(raw.args) ? raw.args : input.split(/\s+/).filter(Boolean)
		const handled = entry?.handlers[name]?.(adapter, { input, argv })
		if (handled === false || handled === undefined) {
			entry?.onUnknown?.(adapter, { input, argv })
		}
	})
	globallyDefinedEx.add(name)
}

function applyKeymapOnce(mapping: KeyMapping): void {
	const ctx = mapping.mode ?? 'normal'
	const key = `${ctx}\u0000${mapping.lhs}`
	if (appliedMaps.has(key))
		return
	Vim.map(mapping.lhs, mapping.rhs, ctx)
	appliedMaps.add(key)
}

const MODE_CLASSES = ['pm-vim-mode-normal', 'pm-vim-mode-insert', 'pm-vim-mode-visual']

const vimLifecyclePluginKey = new PluginKey('prose-motions/pm/vim-lifecycle')

/**
 * Build the full set of ProseMirror plugins that make a bare PM editor
 * vim-enabled. Spread the result into your `EditorState.create({ plugins })`
 * array.
 *
 * ```ts
 * import { EditorState } from 'prosemirror-state'
 * import { EditorView } from 'prosemirror-view'
 * import { vimPlugins } from '@prose-motions/pm'
 *
 * const state = EditorState.create({
 *   schema,
 *   plugins: [...vimPlugins({ defaultMode: 'normal' })],
 * })
 * const view = new EditorView(host, { state })
 * ```
 */
export function vimPlugins(options: VimPluginOptions = {}): Plugin[] {
	for (const m of options.keymaps ?? []) applyKeymapOnce(m)
	for (const name of Object.keys(options.ex?.handlers ?? {})) ensureExDispatcher(name)

	const resolveEl = options.modeClassTarget ?? ((view: EditorView) => view.dom as HTMLElement)

	const getAdapterForView = (view: EditorView): CMVimAdapter => {
		const a = adapterByView.get(view)
		if (!a)
			throw new Error('[prose-motions/pm] adapter not yet initialized')
		return a
	}

	const lifecycle = new Plugin({
		key: vimLifecyclePluginKey,
		view(view) {
			const adapter = new CMVimAdapter(view)
			adapterByView.set(view, adapter)
			registryByAdapter.set(adapter, {
				handlers: { ...(options.ex?.handlers ?? {}) },
				onUnknown: options.ex?.onUnknown,
			})
			Vim.enterVimMode(adapter as unknown as never)
			if ((options.defaultMode ?? 'insert') === 'insert') {
				Vim.handleKey(adapter as unknown as never, 'i', 'user')
			}

			if (options.clipboard === 'system') {
				const unnamed = Vim.getRegisterController?.().unnamedRegister
				if (unnamed) {
					const originalSet = unnamed.setText?.bind(unnamed) as
						((text?: string, linewise?: boolean, blockwise?: boolean) => void) | undefined
					if (originalSet) {
						unnamed.setText = function setText(text?: string, linewise?: boolean, blockwise?: boolean): void {
							originalSet(text, linewise, blockwise)
							if (typeof text !== 'string' || text.length === 0)
								return
							navigator.clipboard?.writeText(text).catch(() => {
								adapter.signal('clipboard-denied', 'write')
							})
						}
					}
				}
			}

			const target = resolveEl(view)
			const applyModeClass = (): void => {
				const next = `pm-vim-mode-${modeOf(adapter)}`
				for (const c of MODE_CLASSES) {
					if (c === next)
						target.classList.add(c)
					else target.classList.remove(c)
				}
			}
			applyModeClass()
			adapter.on('vim-mode-change', applyModeClass)

			if (options.onModeChange) {
				const notify = (): void => options.onModeChange!(modeOf(adapter))
				adapter.on('vim-mode-change', notify)
			}

			return {
				destroy() {
					try {
						Vim.leaveVimMode(adapter as unknown as never)
					}
					catch {}
					for (const c of MODE_CLASSES) target.classList.remove(c)
					registryByAdapter.delete(adapter)
					adapter.destroy()
					adapterByView.delete(view)
				},
			}
		},
	})

	const keymap = vimKeymapPlugin({
		getAdapter: view => getAdapterForView(view),
		getMode: view => modeOf(adapterByView.get(view)),
	})

	return [lifecycle, keymap, marksPlugin()]
}

/** Read the adapter bound to a given EditorView (or undefined before setup). */
export function vimAdapterOf(view: EditorView): CMVimAdapter | undefined {
	return adapterByView.get(view)
}

export type { CMVimAdapter, MarkHandle } from '@prose-motions/adapter'
