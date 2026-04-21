// Vim line/column position. 0-indexed, matches CodeMirror's Pos shape.
export interface Pos {
	line: number
	ch: number
	sticky?: string | null
}

export function pos(line: number, ch: number): Pos {
	return { line, ch }
}

export function posEq(a: Pos, b: Pos): boolean {
	return a.line === b.line && a.ch === b.ch
}

export function posLt(a: Pos, b: Pos): boolean {
	return a.line < b.line || (a.line === b.line && a.ch < b.ch)
}

export function posLe(a: Pos, b: Pos): boolean {
	return posEq(a, b) || posLt(a, b)
}

export function posMin(a: Pos, b: Pos): Pos {
	return posLt(a, b) ? a : b
}

export function posMax(a: Pos, b: Pos): Pos {
	return posLt(a, b) ? b : a
}
