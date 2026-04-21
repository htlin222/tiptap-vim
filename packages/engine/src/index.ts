// Placeholder for @prose-motions/engine.
//
// M2 will populate this module with a single re-export of
// @replit/codemirror-vim's `Vim` API plus a `VimAPI` type describing the
// subset of the surface we actually call from the adapter. Keeping the
// upstream engine behind this chokepoint means a breaking change upstream
// surfaces as a TypeScript error here, not in every consumer.
export const ENGINE_VERSION = '0.0.0-m1-skeleton'
