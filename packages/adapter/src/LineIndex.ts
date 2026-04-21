import type { Node as PMNode } from '@tiptap/pm/model'
import type { Pos } from './Pos'

/**
 * Bidirectional mapping between ProseMirror positions and vim {line, ch}
 * coordinates. Every textblock in the document becomes one vim line. Non-text
 * block leaves (horizontal rules, images rendered as blocks) are skipped — the
 * engine will never see them because CM-style vim has no concept of "line
 * without text".
 *
 * The index is recomputed eagerly on construction. Callers are expected to
 * build a fresh LineIndex per transaction; it's cheap — one doc walk — and the
 * correctness is much simpler than incremental invalidation.
 */
export interface LineEntry {
	/** Absolute PM position of the first in-content offset (textContent index 0). */
	start: number
	/** Absolute PM position of the last in-content offset (textContent.length). */
	end: number
	/** textContent of the block, without intra-block newlines. */
	text: string
}

export class LineIndex {
	readonly lines: LineEntry[]

	constructor(doc: PMNode) {
		const lines: LineEntry[] = []
		doc.descendants((node, pos) => {
			if (!node.isTextblock)
				return true
			const start = pos + 1
			const end = start + node.content.size
			lines.push({ start, end, text: node.textContent })
			// Skip descendants of a textblock — inline marks / text nodes don't
			// contribute additional vim lines.
			return false
		})
		// Fallback for an empty doc or a doc composed only of non-textblock
		// block leaves: expose a single empty vim line so `getCursor` etc.
		// never out-of-bounds the engine.
		if (lines.length === 0)
			lines.push({ start: 0, end: 0, text: '' })
		this.lines = lines
	}

	lineCount(): number {
		return this.lines.length
	}

	lineAt(line: number): LineEntry {
		return this.lines[this.clampLine(line)]
	}

	clampLine(line: number): number {
		if (line < 0)
			return 0
		if (line >= this.lines.length)
			return this.lines.length - 1
		return line
	}

	clampCh(line: number, ch: number): number {
		const l = this.lineAt(line)
		if (ch < 0)
			return 0
		if (ch > l.text.length)
			return l.text.length
		return ch
	}

	clamp(pos: Pos): Pos {
		const line = this.clampLine(pos.line)
		const ch = this.clampCh(line, pos.ch)
		return { line, ch }
	}

	/** Convert a vim {line, ch} into an absolute PM position. */
	toPM(pos: Pos): number {
		const clamped = this.clamp(pos)
		return this.lines[clamped.line].start + clamped.ch
	}

	/** Convert an absolute PM position into a vim {line, ch}. */
	fromPM(pmPos: number): Pos {
		// Binary search — the line array is already sorted by `start`.
		let lo = 0
		let hi = this.lines.length - 1
		while (lo < hi) {
			const mid = (lo + hi + 1) >>> 1
			if (this.lines[mid].start <= pmPos)
				lo = mid
			else hi = mid - 1
		}
		const line = this.lines[lo]
		const ch = Math.max(0, Math.min(line.text.length, pmPos - line.start))
		return { line: lo, ch }
	}

	/** The full document text rendered with '\n' between blocks. */
	toString(): string {
		return this.lines.map(l => l.text).join('\n')
	}
}
