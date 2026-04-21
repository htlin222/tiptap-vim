import type { CommandProps, Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { CMVimAdapter, marksPlugin, vimKeymapPlugin } from '@prose-motions/adapter'
import { Vim } from '@prose-motions/engine'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Public-facing state shape. M4 widens `mode` to include `'visual'` now that
 * the adapter forwards visual selections. `pendingOp` is retained as a
 * always-null field so v0.1.7 consumers that read it keep type-checking —
 * pending-op state has moved into the engine.
 */
export interface VimState {
	mode: 'normal' | 'insert' | 'visual'
	pendingOp: null
}

const adapterByView = new WeakMap<EditorView, CMVimAdapter>()
const adapterByEditor = new WeakMap<Editor, CMVimAdapter>()

/**
 * Read the mode the engine reports for a given adapter. Visual-line and
 * visual-block sub-modes are folded into `'visual'` at this layer; consumers
 * that need to distinguish them can reach into
 * `editor.storage.vimMode.adapter?.state.vim`.
 */
function modeOf(adapter: CMVimAdapter | undefined): 'normal' | 'insert' | 'visual' {
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

function stateFor(adapter: CMVimAdapter | undefined): VimState {
	return {
		mode: modeOf(adapter),
		pendingOp: null,
	}
}

export function vimAdapterOf(editor: Editor): CMVimAdapter | undefined {
	return adapterByEditor.get(editor)
}

/** Install a per-editor storage accessor that resolves from the adapter. */
function installPerEditorStorage(editor: Editor): void {
	const facade = {
		get state(): VimState {
			return stateFor(adapterByEditor.get(editor))
		},
		set state(_next: VimState) {
			// Ignored in M2 — the engine owns authoritative state.
		},
		get adapter(): CMVimAdapter | undefined {
			return adapterByEditor.get(editor)
		},
	}
	;(editor.storage as Record<string, unknown>).vimMode = facade
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		vimMode: {
			/** switch to Vim normal mode */
			enterNormalMode: () => ReturnType
			/** switch to Vim insert mode */
			enterInsertMode: () => ReturnType
		}
	}
}

const vimLifecyclePluginKey = new PluginKey('prose-motions/vim-lifecycle')

/**
 * Ex-command handler. The first argument is the adapter that dispatched the
 * command (so you can inspect per-editor state); the second is the parsed ex
 * input split on whitespace (`:w report.md` → `['report.md']`). Return
 * true / a truthy value when the command is handled — untruthy returns fall
 * through to `onUnknown`.
 */
export type ExHandler = (
	cm: CMVimAdapter,
	args: { input: string, argv: string[] }
) => void | boolean

export interface KeyMapping {
	/** Left-hand side — the key sequence the user types. */
	lhs: string
	/** Right-hand side — what the engine should do instead. */
	rhs: string
	/** Mode the mapping applies in. Defaults to 'normal'. */
	mode?: 'normal' | 'insert' | 'visual'
}

export interface VimModeOptions {
	/**
	 * User-defined keymap overrides. Lowered to `Vim.map(lhs, rhs, ctx)` on
	 * first editor mount. Note: `Vim.map` mutates engine-global state — the
	 * last-configured mapping wins across editors. A per-editor keymap would
	 * need to wait for an upstream API change.
	 */
	keymaps?: KeyMapping[]
	/**
	 * Custom ex commands invoked when the user runs `:name …`.
	 */
	ex?: {
		handlers?: Record<string, ExHandler>
		onUnknown?: ExHandler
	}
}

// One global registry per process — ex-command handlers are routed through
// `Vim.defineEx` which is engine-global. We dispatch to per-editor handlers
// via the `cm` adapter that the engine passes into each handler call.
interface EditorRegistry {
	handlers: Record<string, ExHandler>
	onUnknown?: ExHandler
}
const registryByAdapter = new WeakMap<CMVimAdapter, EditorRegistry>()

// Remember ex commands we've already registered globally so we don't
// re-register on every editor mount.
const globallyDefinedEx = new Set<string>()

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

// Keymaps are global too; track applied lhs to avoid duplicate `Vim.map`.
const appliedMaps = new Set<string>()

function applyKeymapOnce(mapping: KeyMapping): void {
	const ctx = mapping.mode ?? 'normal'
	const key = `${ctx}\u0000${mapping.lhs}`
	if (appliedMaps.has(key))
		return
	Vim.map(mapping.lhs, mapping.rhs, ctx)
	appliedMaps.add(key)
}

export const VimModeExtension = Extension.create<VimModeOptions, { state: VimState, adapter: CMVimAdapter | undefined }>({
	name: 'vimMode',

	addOptions() {
		return {
			keymaps: [],
			ex: {},
		}
	},

	addStorage() {
		// Placeholder — installPerEditorStorage replaces this with a
		// per-editor accessor from addProseMirrorPlugins (which runs
		// synchronously during Editor construction, unlike onCreate which
		// fires from setTimeout(0)).
		return { state: { mode: 'insert', pendingOp: null }, adapter: undefined }
	},

	onDestroy() {
		const adapter = adapterByEditor.get(this.editor)
		if (adapter) {
			try {
				Vim.leaveVimMode(adapter as unknown as never)
			}
			catch {
				// engine can throw during teardown if the view is already gone
			}
			adapter.destroy()
		}
		adapterByEditor.delete(this.editor)
	},

	// ────────────────────────────────────────────────────────────────────────────
	// Commands
	// ────────────────────────────────────────────────────────────────────────────
	addCommands() {
		return {
			enterNormalMode: () => ({ editor }: CommandProps) => {
				const adapter = adapterByEditor.get(editor)
				if (!adapter)
					return false
				if (modeOf(adapter) !== 'normal') {
					Vim.exitInsertMode(adapter as unknown as never)
				}
				return true
			},
			enterInsertMode: () => ({ editor }: CommandProps) => {
				const adapter = adapterByEditor.get(editor)
				if (!adapter)
					return false
				if (modeOf(adapter) !== 'insert') {
					Vim.handleKey(adapter as unknown as never, 'i', 'user')
				}
				return true
			},
		}
	},

	// ────────────────────────────────────────────────────────────────────────────
	// Plugins — engine lifecycle + keymap
	// ────────────────────────────────────────────────────────────────────────────
	addProseMirrorPlugins() {
		const editor = this.editor
		const options = this.options as VimModeOptions
		installPerEditorStorage(editor)

		// Keymaps apply globally — one-shot registration keyed by mode+lhs.
		for (const m of options.keymaps ?? []) applyKeymapOnce(m)

		// Ex-command dispatchers are registered globally once; per-editor
		// handler tables are looked up by adapter identity inside the dispatch
		// trampoline.
		for (const name of Object.keys(options.ex?.handlers ?? {})) ensureExDispatcher(name)

		const getAdapter = (): CMVimAdapter => {
			const a = adapterByEditor.get(editor)
			if (!a)
				throw new Error('[prose-motions] adapter not yet initialized')
			return a
		}

		const lifecycle = new Plugin({
			key: vimLifecyclePluginKey,
			view(view) {
				const adapter = new CMVimAdapter(view)
				adapterByView.set(view, adapter)
				adapterByEditor.set(editor, adapter)
				registryByAdapter.set(adapter, {
					handlers: { ...(options.ex?.handlers ?? {}) },
					onUnknown: options.ex?.onUnknown,
				})
				Vim.enterVimMode(adapter as unknown as never)
				// v0.1.7 booted in insert mode; match that.
				Vim.handleKey(adapter as unknown as never, 'i', 'user')

				// Keep a class on the PM root that mirrors the engine's mode
				// so @prose-motions/styles (and user themes) can drive caret
				// appearance without polling.
				const MODE_CLASSES = ['pm-vim-mode-normal', 'pm-vim-mode-insert', 'pm-vim-mode-visual']
				const applyModeClass = (): void => {
					const vim = (adapter.state.vim ?? null) as {
						insertMode?: boolean
						visualMode?: boolean
					} | null
					const next = vim?.insertMode
						? 'pm-vim-mode-insert'
						: vim?.visualMode
							? 'pm-vim-mode-visual'
							: 'pm-vim-mode-normal'
					const cl = view.dom.classList
					for (const c of MODE_CLASSES) {
						if (c === next)
							cl.add(c)
						else cl.remove(c)
					}
				}
				applyModeClass()
				adapter.on('vim-mode-change', applyModeClass)

				return {
					destroy() {
						try {
							Vim.leaveVimMode(adapter as unknown as never)
						}
						catch {}
						for (const c of MODE_CLASSES) view.dom.classList.remove(c)
						registryByAdapter.delete(adapter)
						adapter.destroy()
						adapterByView.delete(view)
					},
				}
			},
		})

		const keymap = vimKeymapPlugin({
			getAdapter,
			getMode: () => modeOf(adapterByEditor.get(editor)),
		})

		return [lifecycle, keymap, marksPlugin()]
	},
})
