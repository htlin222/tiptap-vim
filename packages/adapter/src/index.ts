export { CMVimAdapter } from './CMVimAdapter'
export { type LineEntry, LineIndex } from './LineIndex'
export {
	addMark,
	clearMarks,
	type MarkHandle,
	type MarkSpec,
	marksPlugin,
	marksPluginKey,
} from './marksPlugin'
export { pos, type Pos, posEq, posLe, posLt, posMax, posMin } from './Pos'
export { type VimKeymapOptions, vimKeymapPlugin, vimKeymapPluginKey } from './vimKeymapPlugin'

export const ADAPTER_VERSION = '0.2.0-m4'
