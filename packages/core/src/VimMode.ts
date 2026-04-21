import type {
	CommandProps,
	Editor,
	KeyboardShortcutCommand,
} from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Extension } from "@tiptap/core";
import { keymap } from "@tiptap/pm/keymap";
import { Plugin, TextSelection } from "@tiptap/pm/state";

interface PendingOp {
	key: string;
	expires: number;
}

export interface VimState {
	mode: "normal" | "insert";
	pendingOp: PendingOp | null;
}

// Tiptap's `Extension.storage` is a single object shared across every Editor
// that loads the same extension reference — so per-editor state cannot live
// inside it. We key a WeakMap by the Editor instance. Public reads/writes go
// through the helper below; `editor.storage.vimMode.state` is kept as a thin
// getter installed per-editor in `onCreate`.
const editorStates = new WeakMap<Editor, VimState>();

function makeState(): VimState {
	return { mode: "insert", pendingOp: null };
}

export function vimStateOf(editor: Editor): VimState {
	let s = editorStates.get(editor);
	if (!s) {
		s = makeState();
		editorStates.set(editor, s);
	}
	return s;
}

// Per-editor storage object — one is installed on each Editor in `onCreate`,
// overriding the singleton placeholder returned by `addStorage`. This way
// `editor.storage.vimMode.state` always reads the right editor's slot.
function installPerEditorStorage(editor: Editor) {
	const perEditor = {
		get state(): VimState {
			return vimStateOf(editor);
		},
		set state(next: VimState) {
			const slot = vimStateOf(editor);
			slot.mode = next.mode;
			slot.pendingOp = next.pendingOp;
		},
	};
	// Replace the shared storage entry on this specific Editor with the
	// per-editor accessor. `editor.storage` is a plain object keyed by
	// extension name — assigning here is scoped to this Editor only.
	(editor.storage as Record<string, unknown>).vimMode = perEditor;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		vimMode: {
			/** switch to Vim normal mode */
			enterNormalMode: () => ReturnType;
			/** switch to Vim insert mode */
			enterInsertMode: () => ReturnType;
		};
	}
}

export const VimModeExtension = Extension.create<object, { state: VimState }>({
	name: "vimMode",

	addStorage() {
		// Placeholder — overwritten per-editor by `onCreate`.
		return { state: makeState() };
	},

	onDestroy() {
		editorStates.delete(this.editor);
	},

	// ────────────────────────────────────────────────────────────────────────────
	// Commands
	// ────────────────────────────────────────────────────────────────────────────
	addCommands() {
		return {
			enterNormalMode:
				() =>
				({ editor, tr, dispatch }: CommandProps) => {
					if (dispatch) {
						vimStateOf(editor).mode = "normal";
						const { $head } = tr.selection;
						const newPos = Math.max(1, $head.pos - 1);
						dispatch(tr.setSelection(TextSelection.create(tr.doc, newPos)));
					}
					return true;
				},
			enterInsertMode:
				() =>
				({ editor }: CommandProps) => {
					vimStateOf(editor).mode = "insert";
					return true;
				},
		};
	},

	// ────────────────────────────────────────────────────────────────────────────
	// Keyboard shortcuts
	// ────────────────────────────────────────────────────────────────────────────
	addKeyboardShortcuts() {
		// Always resolve the editor from shortcut props so the handler is
		// correct regardless of which editor instance fires the keystroke.
		type Props = Parameters<KeyboardShortcutCommand>[0];

		const moveBy =
			(delta: number): KeyboardShortcutCommand =>
			(props: Props) => {
				const { editor } = props;
				const { state: s, view } = editor;
				const { $head } = s.selection;
				const newPos = Math.max(
					0,
					Math.min(s.doc.content.size, $head.pos + delta),
				);
				view.dispatch(s.tr.setSelection(TextSelection.create(s.doc, newPos)));
				return true;
			};

		const moveLine =
			(dir: number): KeyboardShortcutCommand =>
			(props: Props) => {
				const { editor } = props;
				const { state: s, view } = editor;
				const { $head } = s.selection;
				const start = view.coordsAtPos($head.pos);
				if (!start) return true;
				const lineHeight =
					Number.parseInt(getComputedStyle(view.dom).lineHeight) || 20;
				const target = view.posAtCoords({
					left: start.left,
					top: start.top + dir * lineHeight,
				});
				if (target) {
					view.dispatch(
						s.tr.setSelection(TextSelection.create(s.doc, target.pos)),
					);
				}
				return true;
			};

		const moveToPrevWord = (): KeyboardShortcutCommand => (props: Props) => {
			const { editor } = props;
			const { state: s, view } = editor;
			let pos = s.selection.$head.pos;
			if (pos === 0) return true;

			const charAt = (p: number): string =>
				s.doc.textBetween(p, p + 1, "\0", "\0") || "";

			while (pos > 0 && /\s/.test(charAt(pos - 1))) pos--;
			while (pos > 0 && !/\s/.test(charAt(pos - 1))) pos--;

			view.dispatch(s.tr.setSelection(TextSelection.create(s.doc, pos)));
			return true;
		};

		const deleteCurrentLine = (editor: Editor): void => {
			const { state: s, view } = editor;
			const { $head } = s.selection;
			const start = $head.start($head.depth);
			const end = $head.end($head.depth);
			view.dispatch(s.tr.delete(start, end).scrollIntoView());
		};

		const shortcuts: Record<string, KeyboardShortcutCommand> = {
			Escape: (props) => {
				props.editor.commands.enterNormalMode();
				return true;
			},
			i: (props) => {
				if (vimStateOf(props.editor).mode === "normal") {
					props.editor.commands.enterInsertMode();
					return true;
				}
				return false;
			},
			h: (props) =>
				vimStateOf(props.editor).mode === "normal" ? moveBy(-1)(props) : false,
			l: (props) =>
				vimStateOf(props.editor).mode === "normal" ? moveBy(1)(props) : false,
			j: (props) =>
				vimStateOf(props.editor).mode === "normal" ? moveLine(1)(props) : false,
			k: (props) =>
				vimStateOf(props.editor).mode === "normal"
					? moveLine(-1)(props)
					: false,
			b: (props) =>
				vimStateOf(props.editor).mode === "normal"
					? moveToPrevWord()(props)
					: false,
			d: (props) => {
				const s = vimStateOf(props.editor);
				if (s.mode !== "normal") return false;

				const now = Date.now();
				if (
					s.pendingOp &&
					s.pendingOp.key === "d" &&
					s.pendingOp.expires > now
				) {
					s.pendingOp = null;
					deleteCurrentLine(props.editor);
					return true;
				}
				s.pendingOp = { key: "d", expires: now + 500 };
				return true;
			},
		};

		// Block every other printable char while in Normal mode.
		const catchAllHandler: KeyboardShortcutCommand = (props) =>
			vimStateOf(props.editor).mode === "normal";
		const printableChars =
			"abcdefgmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}\\|;:'\",.<>?/~`";
		for (const char of printableChars) {
			if (!shortcuts[char]) shortcuts[char] = catchAllHandler;
		}

		return shortcuts;
	},

	// ────────────────────────────────────────────────────────────────────────────
	// Additional ProseMirror plugins
	//   – block regular text input while in Normal mode
	//   – allow paste only in Insert mode
	// ────────────────────────────────────────────────────────────────────────────
	addProseMirrorPlugins() {
		// `addProseMirrorPlugins` is called synchronously during Editor
		// construction with `this.editor` already bound to the new Editor —
		// earlier than `onCreate` (which fires inside setTimeout). We use this
		// to install per-editor storage eagerly, so `editor.storage.vimMode`
		// already has a per-editor accessor by the time the constructor
		// returns.
		const editor = this.editor;
		vimStateOf(editor);
		installPerEditorStorage(editor);

		const viewToEditor = new WeakMap<EditorView, Editor>();
		const resolveEditor = (view: EditorView): Editor => {
			let ed = viewToEditor.get(view);
			if (!ed) {
				ed = editor;
				viewToEditor.set(view, ed);
			}
			return ed;
		};

		return [
			keymap({
				"Mod-v": (_state, _dispatch, view) =>
					vimStateOf(resolveEditor(view!)).mode === "insert",
			}),
			new Plugin({
				props: {
					handleTextInput(view) {
						return vimStateOf(resolveEditor(view)).mode === "normal";
					},
				},
			}),
		];
	},
});
