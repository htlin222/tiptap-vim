import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { MarkHandle, MarkSpec } from './marksPlugin'
import type { Pos } from './Pos'
import { TextSelection } from '@tiptap/pm/state'
import { LineIndex } from './LineIndex'
import { addMark } from './marksPlugin'
import { pos as mkPos, posEq } from './Pos'

interface CMRange {
	anchor: Pos
	head: Pos
}

interface OverlayHandle {
	query: RegExp
	marks: MarkHandle[]
}

type Handler = (...args: unknown[]) => void

interface PendingOp {
	tr: Transaction
	doc: PMNode
	depth: number
}

let adapterIdCounter = 0
let markerIdCounter = 0

/**
 * A CodeMirror-style bookmark/marker. Survives position remapping across
 * replaceRange calls by re-reading the adapter's LineIndex. The engine uses
 * bookmarks to remember the insert-mode entry point; for M2 a lightweight
 * offset+assoc pair is enough.
 */
class CMMarker {
	readonly id = ++markerIdCounter
	offset: number | null
	assoc: number

	constructor(readonly cm: CMVimAdapter, offset: number, assoc = 1) {
		this.offset = offset
		this.assoc = assoc
	}

	clear(): void {
		this.offset = null
	}

	find(): Pos | null {
		if (this.offset == null)
			return null
		return this.cm.posFromIndex(this.offset)
	}

	update(): void {
		// PM trs auto-map positions; manual mapping would require plumbing the
		// original change descriptor through. For M2 insert-mode bookmarks this
		// is sufficient because they're re-set on every enterInsertMode.
	}
}

/**
 * Adapter that exposes the subset of CodeMirror 5's instance API that
 * `@replit/codemirror-vim`'s `Vim.handleKey` and friends call into, backed by
 * a ProseMirror `EditorView`.
 *
 * Scope for M2: enough to drive h/j/k/l/i/Esc/b/dd with parity against
 * v0.1.7. Methods not required by those commands are stubbed with sensible
 * defaults so the engine doesn't trip on unexpected `undefined`s; unrelated
 * features (markText, search, macros, ex, …) will be filled in from M3 on.
 */
export class CMVimAdapter {
	readonly $mid = ++adapterIdCounter

	readonly view: EditorView

	// The engine stores its per-instance vim state under `cm.state.vim`.
	state: {
		vim?: unknown
		vimPlugin?: unknown
		statusbar?: HTMLElement | null
		dialog?: HTMLElement | null
		keyMap?: string
		overwrite?: boolean
		textwidth?: number
	} = {}

	options: Record<string, unknown> = {}
	marks: Record<string, unknown> = {}

	curOp: PendingOp | null = null

	// Shape required by the engine's static `on` / `off` / `signal` helpers —
	// they read `emitter._handlers[type]` as an Array<Function> directly.
	_handlers: Record<string, Handler[]> = {}

	private lineIndex: LineIndex

	constructor(view: EditorView) {
		this.view = view
		this.lineIndex = new LineIndex(view.state.doc)
	}

	// ── doc & lines ────────────────────────────────────────────────────────
	private currentDoc(): PMNode {
		return this.curOp ? this.curOp.doc : this.view.state.doc
	}

	private refreshIndex(doc: PMNode = this.currentDoc()): void {
		this.lineIndex = new LineIndex(doc)
	}

	getValue(): string {
		return this.lineIndex.toString()
	}

	lineCount(): number {
		return this.lineIndex.lineCount()
	}

	firstLine(): number {
		return 0
	}

	lastLine(): number {
		return this.lineIndex.lineCount() - 1
	}

	getLine(row: number): string {
		return this.lineIndex.lineAt(row).text
	}

	getLineHandle(row: number): { row: number, index: number } {
		return { row, index: row }
	}

	getLineNumber(handle: { row: number }): number | null {
		return typeof handle.row === 'number' ? handle.row : null
	}

	releaseLineHandles(): void {}

	clipPos(p: Pos): Pos {
		return this.lineIndex.clamp(p)
	}

	// ── cursor & selection ─────────────────────────────────────────────────
	getCursor(which: 'head' | 'anchor' | 'start' | 'end' = 'head'): Pos {
		const sel = this.primaryRange()
		switch (which) {
			case 'anchor':
				return sel.anchor
			case 'start':
				return selStart(sel)
			case 'end':
				return selEnd(sel)
			default:
				return sel.head
		}
	}

	setCursor(line: number | Pos, ch?: number): void {
		const p: Pos = typeof line === 'number' ? mkPos(line, ch ?? 0) : line
		const pmPos = this.lineIndex.toPM(p)
		this.withTr((tr) => {
			tr.setSelection(TextSelection.create(tr.doc, pmPos))
		})
	}

	setSelection(anchor: Pos, head: Pos, _options?: unknown): void {
		const a = this.lineIndex.toPM(anchor)
		const h = this.lineIndex.toPM(head)
		this.withTr((tr) => {
			tr.setSelection(TextSelection.create(tr.doc, a, h))
		})
	}

	setSelections(ranges: CMRange[], primIndex: number = 0): void {
		// ProseMirror doesn't support multi-selection out of the box. Take the
		// primary range and project the others away.
		const r = ranges[primIndex] ?? ranges[0]
		if (!r)
			return
		this.setSelection(r.anchor, r.head)
	}

	listSelections(): CMRange[] {
		return [this.primaryRange()]
	}

	getSelection(): string {
		return this.getRange(this.getCursor('start'), this.getCursor('end'))
	}

	getSelections(): string[] {
		return [this.getSelection()]
	}

	replaceSelection(text: string): void {
		this.replaceRange(text, this.getCursor('start'), this.getCursor('end'))
	}

	replaceSelections(replacements: string[]): void {
		// Single-selection projection.
		if (replacements.length)
			this.replaceSelection(replacements[0])
	}

	somethingSelected(): boolean {
		const sel = this.primaryRange()
		return !posEq(sel.anchor, sel.head)
	}

	private primaryRange(): CMRange {
		const sel = this.curOp ? this.curOp.tr.selection : this.view.state.selection
		const anchor = this.lineIndex.fromPM(sel.anchor)
		const head = this.lineIndex.fromPM(sel.head)
		return { anchor, head }
	}

	// ── text reads & writes ────────────────────────────────────────────────
	getRange(a: Pos, b: Pos): string {
		const from = this.lineIndex.toPM(a)
		const to = this.lineIndex.toPM(b)
		if (from === to)
			return ''
		return this.currentDoc().textBetween(
			Math.min(from, to),
			Math.max(from, to),
			'\n',
			'\n',
		)
	}

	replaceRange(text: string, from: Pos, to?: Pos, _origin?: string): void {
		const fromPM = this.lineIndex.toPM(from)
		const toPM = to ? this.lineIndex.toPM(to) : fromPM
		this.withTr((tr) => {
			if (text.length === 0) {
				tr.delete(Math.min(fromPM, toPM), Math.max(fromPM, toPM))
			}
			else {
				tr.replaceWith(
					Math.min(fromPM, toPM),
					Math.max(fromPM, toPM),
					this.view.state.schema.text(text),
				)
			}
		})
	}

	// ── focus / DOM ────────────────────────────────────────────────────────
	focus(): void {
		this.view.focus()
	}

	blur(): void {
		this.view.dom.blur()
	}

	hasFocus(): boolean {
		return this.view.hasFocus()
	}

	getInputField(): HTMLElement {
		return this.view.dom as HTMLElement
	}

	getWrapperElement(): HTMLElement {
		return this.view.dom as HTMLElement
	}

	// ── coords (for j/k / findPosV) ────────────────────────────────────────
	defaultTextHeight(): number {
		const style = getComputedStyle(this.view.dom)
		const lh = Number.parseFloat(style.lineHeight)
		if (Number.isFinite(lh) && lh > 0)
			return lh
		const fs = Number.parseFloat(style.fontSize)
		return Number.isFinite(fs) && fs > 0 ? fs * 1.2 : 20
	}

	charCoords(p: Pos, _mode: 'div' | 'local' = 'local'): {
		left: number
		top: number
		bottom: number
	} {
		const pmPos = this.lineIndex.toPM(p)
		try {
			const c = this.view.coordsAtPos(pmPos)
			return { left: c.left, top: c.top, bottom: c.bottom }
		}
		catch {
			// jsdom / headless environments may not support coords. Return a
			// stable fake so the engine's math doesn't NaN.
			return { left: 0, top: 0, bottom: 0 }
		}
	}

	coordsChar(
		coords: { left: number, top: number },
		_mode: 'div' | 'local' = 'local',
	): Pos {
		try {
			const hit = this.view.posAtCoords({ left: coords.left, top: coords.top })
			if (!hit)
				return this.getCursor()
			return this.lineIndex.fromPM(hit.pos)
		}
		catch {
			return this.getCursor()
		}
	}

	/**
	 * Move vertically by `amount` lines. In an editor with soft-wrap this
	 * would consult pixel coords; our PM-backed adapter models one vim line
	 * per textblock, so logical line stepping is correct and, critically,
	 * resilient to environments without layout (jsdom, initial mount).
	 */
	findPosV(
		start: Pos,
		amount: number,
		_unit: 'page' | 'line',
		goalColumn?: number,
	): Pos & { hitSide?: boolean } {
		const targetLine = start.line + amount
		if (targetLine < 0) {
			return { ...mkPos(0, 0), hitSide: true }
		}
		if (targetLine > this.lastLine()) {
			const last = this.lastLine()
			return { ...mkPos(last, this.getLine(last).length), hitSide: true }
		}
		const desiredCol = goalColumn != null ? Math.floor(goalColumn) : start.ch
		const line = this.getLine(targetLine)
		const ch = Math.min(desiredCol, line.length)
		return mkPos(targetLine, ch)
	}

	scrollIntoView(_pos?: Pos, _margin?: number): void {
		// Rely on the PM view's automatic scroll-into-view on transaction apply.
	}

	// ── operation batching ─────────────────────────────────────────────────
	operation<T>(fn: () => T, _force?: boolean): T {
		const owned = !this.curOp
		if (owned) {
			const base = this.view.state.tr
			this.curOp = {
				tr: base,
				doc: base.doc,
				depth: 0,
			}
		}
		else {
			this.curOp!.depth++
		}
		try {
			return fn()
		}
		finally {
			if (owned) {
				const op = this.curOp!
				this.curOp = null
				if (op.tr.docChanged || op.tr.selectionSet) {
					this.view.dispatch(op.tr)
				}
				this.refreshIndex(this.view.state.doc)
			}
			else if (this.curOp) {
				this.curOp.depth--
			}
		}
	}

	private withTr(mutate: (tr: Transaction) => void): void {
		if (this.curOp) {
			mutate(this.curOp.tr)
			this.curOp.doc = this.curOp.tr.doc
			this.refreshIndex(this.curOp.doc)
			return
		}
		const tr = this.view.state.tr
		mutate(tr)
		if (tr.docChanged || tr.selectionSet) {
			this.view.dispatch(tr)
		}
		this.refreshIndex(this.view.state.doc)
	}

	// ── events ─────────────────────────────────────────────────────────────
	// Match the shape of the engine's static `on` / `off` / `signal` helpers
	// so both instance calls and static CM.on/CM.off/CM.signal walk the same
	// storage (`emitter._handlers[type]` as an Array<Function>).
	on(type: string, fn: Handler): void {
		;(this._handlers[type] ||= []).push(fn)
	}

	off(type: string, fn: Handler): void {
		const arr = this._handlers[type]
		if (!arr)
			return
		const idx = arr.indexOf(fn)
		if (idx >= 0)
			this._handlers[type] = arr.slice(0, idx).concat(arr.slice(idx + 1))
	}

	signal(type: string, ...args: unknown[]): void {
		const arr = this._handlers[type]
		if (!arr)
			return
		for (const fn of arr.slice()) fn(...args)
	}

	// ── options ────────────────────────────────────────────────────────────
	getOption(name: string): unknown {
		return this.options[name]
	}

	setOption(name: string, value: unknown): void {
		this.options[name] = value
	}

	// ── lifecycle ──────────────────────────────────────────────────────────
	destroy(): void {
		this.closeDialog()
		this._handlers = {}
	}

	// ── search overlays ────────────────────────────────────────────────────
	private overlays: OverlayHandle[] = []

	/**
	 * Highlight every match of `query` across the document, backed by the
	 * adapter's marksPlugin. Returns the overlay handle the engine uses to
	 * remove the highlights later.
	 */
	addOverlay(spec: { query: RegExp } | OverlayHandle | null | undefined): OverlayHandle | undefined {
		if (!spec || !(spec as { query: RegExp }).query)
			return undefined
		const query = (spec as { query: RegExp }).query
		const marks: MarkHandle[] = []
		for (let line = 0; line <= this.lastLine(); line++) {
			const text = this.getLine(line)
			query.lastIndex = 0
			let m: RegExpExecArray | null
			// eslint-disable-next-line no-cond-assign
			while ((m = query.exec(text)) != null) {
				if (m[0].length === 0) {
					query.lastIndex++
					continue
				}
				marks.push(this.markText(
					{ line, ch: m.index },
					{ line, ch: m.index + m[0].length },
					{ className: 'pm-vim-search-match' },
				))
				if (!query.global)
					break
			}
		}
		const handle: OverlayHandle = { query, marks }
		this.overlays.push(handle)
		return handle
	}

	/**
	 * Remove the given overlay's highlights. Accepts either the handle
	 * returned by `addOverlay` or null/undefined (no-op).
	 */
	removeOverlay(handle?: OverlayHandle | null): void {
		if (!handle) {
			// Matches CodeMirror's removeOverlay(): called with no args means
			// "remove every overlay".
			for (const h of this.overlays.splice(0)) {
				for (const m of h.marks) m.clear()
			}
			return
		}
		const idx = this.overlays.indexOf(handle)
		if (idx < 0)
			return
		for (const m of handle.marks) m.clear()
		this.overlays.splice(idx, 1)
	}

	// ── dialog (drives `:` and `/` prompts) ────────────────────────────────
	private dialogCloser: (() => void) | null = null

	/**
	 * CodeMirror-style dialog. The engine builds a DOM fragment containing a
	 * prompt label and `<input>`, hands it here, and expects back a close
	 * function. We append the fragment to a dialog container positioned just
	 * under the PM view so it looks docked to the editor. Enter calls
	 * `callback(value)`; Escape / blur close without calling it.
	 */
	openDialog(
		template: Element,
		callback: ((value: string) => void) | undefined,
		options: { closeOnEnter?: boolean, closeOnBlur?: boolean, bottom?: boolean, value?: string } = {},
	): (newValue?: string) => void {
		// Only one dialog open at a time — closing a prior one is cheap.
		this.closeDialog()

		const host = document.createElement('div')
		host.className = 'pm-vim-dialog'
		host.appendChild(template)

		const parent = this.view.dom.parentElement ?? document.body
		parent.appendChild(host)

		const input = host.querySelector('input') as HTMLInputElement | null
		if (input && typeof options.value === 'string')
			input.value = options.value
		input?.focus()

		let closed = false
		const close = (submitValue?: string): void => {
			if (closed)
				return
			closed = true
			host.remove()
			this.dialogCloser = null
			if (submitValue != null)
				callback?.(submitValue)
		}
		this.dialogCloser = () => close()

		input?.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault()
				if (options.closeOnEnter !== false)
					close(input.value)
				else callback?.(input.value)
			}
			else if (event.key === 'Escape') {
				event.preventDefault()
				close()
			}
		})

		if (options.closeOnBlur) {
			input?.addEventListener('blur', () => close(), { once: true })
		}

		return (newVal?: string): void => close(newVal)
	}

	private closeDialog(): void {
		this.dialogCloser?.()
	}

	// ── bookmarks ──────────────────────────────────────────────────────────
	setBookmark(cursor: Pos, options?: { insertLeft?: boolean }): CMMarker {
		const offset = this.lineIndex.toPM(cursor)
		return new CMMarker(this, offset, options?.insertLeft ? -1 : 1)
	}

	/**
	 * CodeMirror-style markText. Backed by the adapter's PM decoration plugin —
	 * decorations survive subsequent edits via `tr.mapping`. The returned
	 * handle exposes `clear()` / `find()` that both rebase through the plugin
	 * state, so callers don't need to know about PM positions.
	 */
	markText(from: Pos, to: Pos, spec: MarkSpec = {}): MarkHandle {
		const a = this.lineIndex.toPM(from)
		const b = this.lineIndex.toPM(to)
		return addMark(this.view, Math.min(a, b), Math.max(a, b), spec)
	}

	// ── stubs for niche features (filled in from M3 on) ────────────────────
	indexFromPos(p: Pos): number {
		return this.lineIndex.toPM(p)
	}

	posFromIndex(offset: number): Pos {
		return this.lineIndex.fromPM(offset)
	}

	toggleOverwrite(on: boolean): void {
		this.state.overwrite = on
	}

	getMode(): { name: string | undefined } {
		return { name: 'prose-motions' }
	}

	refresh(): void {}

	getScrollInfo(): { left: number, top: number, height: number, width: number, clientHeight: number, clientWidth: number } {
		const el = this.view.dom as HTMLElement
		return {
			left: el.scrollLeft,
			top: el.scrollTop,
			height: el.scrollHeight,
			width: el.scrollWidth,
			clientHeight: el.clientHeight,
			clientWidth: el.clientWidth,
		}
	}

	scrollTo(_x?: number | null, _y?: number | null): void {}

	setSize(_w: number, _h: number): void {}
}

function selStart(r: CMRange): Pos {
	return posLtImpl(r.anchor, r.head) ? r.anchor : r.head
}

function selEnd(r: CMRange): Pos {
	return posLtImpl(r.anchor, r.head) ? r.head : r.anchor
}

function posLtImpl(a: Pos, b: Pos): boolean {
	return a.line < b.line || (a.line === b.line && a.ch < b.ch)
}
