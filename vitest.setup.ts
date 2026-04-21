// Mock window.getSelection since jsdom doesn't implement it
// This is needed for ProseMirror/Tiptap to work properly in tests
Object.defineProperty(window, 'getSelection', {
	value: () => ({
		addRange: () => {},
		removeAllRanges: () => {},
		getRangeAt: () => ({
			getBoundingClientRect: () => ({
				top: 0,
				left: 0,
				bottom: 0,
				right: 0,
				width: 0,
				height: 0,
			}),
			getClientRects: () => [],
		}),
	}),
	writable: true,
})

// Mock ResizeObserver which is used by some Tiptap features
globalThis.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

// Mock window.scroll which might be called by the editor
window.scroll = () => {}

// jsdom doesn't implement Range#getClientRects / getBoundingClientRect, which
// ProseMirror's coordsAtPos relies on (and which the vim engine calls for
// motions like `$`/`j`/`k`). Return zero-sized rects so the engine's fallback
// paths run instead of crashing.
const emptyRect = {
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	width: 0,
	height: 0,
	x: 0,
	y: 0,
	toJSON() {
		return emptyRect
	},
}
if (!Range.prototype.getClientRects) {
	Range.prototype.getClientRects = () => ({
		length: 0,
		item: () => null,
		* [Symbol.iterator]() {},
	}) as unknown as DOMRectList
}
if (!Range.prototype.getBoundingClientRect) {
	Range.prototype.getBoundingClientRect = () => emptyRect as unknown as DOMRect
}

// jsdom also leaves document.elementFromPoint / document.caretRangeFromPoint
// unimplemented. PM's posAtCoords uses them, and the vim engine calls that for
// findPosV. Return null so the adapter's fallback path runs.
type DocPointFn = (x: number, y: number) => Element | null
const docProto = Object.getPrototypeOf(document) as {
	elementFromPoint?: DocPointFn
	caretRangeFromPoint?: (x: number, y: number) => Range | null
}
if (typeof docProto.elementFromPoint !== 'function') {
	docProto.elementFromPoint = () => null
}
if (typeof docProto.caretRangeFromPoint !== 'function') {
	docProto.caretRangeFromPoint = () => null
}

// Add any custom matchers or test utilities here if needed
