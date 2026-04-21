import type { CommandProps, Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { CMVimAdapter, vimKeymapPlugin } from '@prose-motions/adapter'
import { Vim } from '@prose-motions/engine'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Public-facing state shape. Kept narrow for M2; `pendingOp` is retained as a
 * always-null field so v0.1.7 consumers that read it keep type-checking —
 * pending-op state has moved into the engine.
 */
export interface VimState {
	mode: 'normal' | 'insert'
	pendingOp: null
}

const adapterByView = new WeakMap<EditorView, CMVimAdapter>()
const adapterByEditor = new WeakMap<Editor, CMVimAdapter>()

/**
 * Read the mode the engine reports for a given adapter. Visual / visual-line /
 * visual-block are collapsed to `'normal'` until M4 exposes visual support.
 */
function modeOf(adapter: CMVimAdapter | undefined): 'normal' | 'insert' {
	const vim = (adapter?.state.vim ?? null) as { insertMode?: boolean } | null
	return vim?.insertMode ? 'insert' : 'normal'
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

export const VimModeExtension = Extension.create<object, { state: VimState, adapter: CMVimAdapter | undefined }>({
	name: 'vimMode',

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
		installPerEditorStorage(editor)

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
				Vim.enterVimMode(adapter as unknown as never)
				// v0.1.7 booted in insert mode; match that.
				Vim.handleKey(adapter as unknown as never, 'i', 'user')
				return {
					destroy() {
						try {
							Vim.leaveVimMode(adapter as unknown as never)
						}
						catch {}
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

		return [lifecycle, keymap]
	},
})
