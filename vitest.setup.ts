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

// Add any custom matchers or test utilities here if needed
