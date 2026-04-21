import { VimMode } from "@prose-motions/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

function mount(id: string, statusId: string, initial: string) {
	const element = document.getElementById(id)!;
	const status = document.getElementById(statusId)!;
	const editor = new Editor({
		element,
		extensions: [StarterKit, VimMode],
		content: initial,
		onTransaction() {
			status.textContent = `mode: ${editor.storage.vimMode.state.mode}`;
		},
	});
	status.textContent = `mode: ${editor.storage.vimMode.state.mode}`;
	return editor;
}

mount(
	"editor-a",
	"status-a",
	"<p>Editor A — type here. Esc → h/j/k/l / b / dd.</p>",
);
mount("editor-b", "status-b", "<p>Editor B — independent Vim state.</p>");
