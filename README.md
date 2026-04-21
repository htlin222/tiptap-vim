<div align="center">
  <h1>@prose-motions/core</h1>
  <p>Drop-in Vim mode for Tiptap / ProseMirror editors</p>

  [![npm version](https://img.shields.io/npm/v/@prose-motions/core)](https://www.npmjs.com/package/@prose-motions/core)
  [![npm](https://img.shields.io/npm/l/@prose-motions/core)](https://www.npmjs.com/package/@prose-motions/core)
</div>

`@prose-motions/core` brings a **real vim engine** to any [Tiptap (v2)](https://tiptap.dev) or [ProseMirror](https://prosemirror.net) editor. Rather than hand-rolling motions, it routes keystrokes through `@replit/codemirror-vim` via a ProseMirror-backed adapter — the same pattern `monaco-vim` uses for Monaco. That gets you counts, operators, text-objects, registers, search, ex-commands, and `.`-repeat for free, with per-editor isolation.

## Packages

| Package | Purpose |
| ------- | ------- |
| `@prose-motions/core` | Tiptap extension — the thing you install |
| `@prose-motions/adapter` | ProseMirror-backed CodeMirror-shape adapter (`CMVimAdapter`, `LineIndex`, `marksPlugin`, `vimKeymapPlugin`) |
| `@prose-motions/engine` | Single chokepoint re-exporting `@replit/codemirror-vim`'s `Vim` API |
| `@prose-motions/styles` | Opt-in CSS for block caret, visual selection, dialog, status bar |
| `@prose-motions/statusbar-vanilla` | Framework-free mode label |
| `@prose-motions/statusbar-react` | React wrapper around the vanilla bar |

## Installation

```bash
bun add @prose-motions/core
# optional:
bun add @prose-motions/styles         # caret / selection CSS
bun add @prose-motions/statusbar-react # React status bar
```

## Usage (Tiptap React)

```tsx
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { VimMode } from '@prose-motions/core'
import '@prose-motions/styles/vim.css'

function MyEditor() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      VimMode.configure({
        defaultMode: 'normal',
        keymaps: [{ lhs: 'jk', rhs: '<Esc>', mode: 'insert' }],
        ex: { handlers: { w: () => save() } },
        onModeChange: (mode) => console.log('mode →', mode),
      }),
    ],
    content: '<p>hello world</p>',
  })
  return <EditorContent editor={editor} />
}
```

## Features

Every motion in vim's normal / visual modes the engine implements is available. A few highlights:

- **Motions** `h j k l` `w e b` `0 ^ $` `gg G` `f F t T ; ,`
- **Counts** `3w` `5j` `d3w`
- **Operators** `d` `c` `y` `p` `P`
- **Text objects** `iw` `aw` `i"` `ip` `ap`
- **Visual** `v` `V` + operator (including linewise across blocks)
- **Ex** `:w`, `:q`, `:s/foo/bar/` — dispatched to your handlers via config
- **Search** `/foo<CR>` highlights matches (requires `@prose-motions/styles`)
- **`.`-repeat** after any edit
- **Per-editor isolation** — two editors on one page never share state

## Configuration

```ts
VimMode.configure({
  // Boot mode — 'insert' (default, matches v0.1.x) or 'normal'.
  defaultMode: 'insert',

  // Key remaps. Lowered to Vim.map — note these are engine-global:
  // the last configured mapping wins across editors on the page.
  keymaps: [
    { lhs: 'jk', rhs: '<Esc>', mode: 'insert' },
    { lhs: ' w', rhs: ':w<CR>', mode: 'normal' },
  ],

  // Ex commands. Handlers receive (adapter, { input, argv }).
  // Return `false` to fall through to onUnknown.
  ex: {
    handlers: {
      w: (cm, { argv }) => save(argv[0]),
      q: () => window.close(),
    },
    onUnknown: (cm, { input }) => toast(`:${input} — no such command`),
  },

  // 'internal' (default) keeps yank in the engine's register bank;
  // 'system' mirrors yanks to navigator.clipboard and emits
  // 'clipboard-denied' on permission failure.
  clipboard: 'internal',

  // Mode callback. The value is the collapsed mode
  // ('normal' | 'insert' | 'visual'); visual-line / visual-block
  // are available via editor.storage.vimMode.adapter.state.vim.
  onModeChange: (mode) => …,
})
```

## Status bar

```tsx
import { VimStatusBar } from '@prose-motions/statusbar-react'

<VimStatusBar editor={editor} />
```

Vanilla equivalent:

```ts
import { mountStatusBar } from '@prose-motions/statusbar-vanilla'
const handle = mountStatusBar(host, editor)
// later:  handle.destroy()
```

## Why Prose Motions

- **Real vim** — adapts a proven engine instead of reinventing operators, text-objects, and ex-commands.
- **Decoupled** — `engine → adapter → core` is a stable dependency chain; visual styling and status UI are leaves you can swap out.
- **Per-editor state** — no module-global footguns; two editors on one page never cross-talk.
- **PM-shape aware** — `LineIndex` maps textblocks to vim lines; `markText` lowers to PM decorations that remap cleanly across edits.
- **TypeScript-first** — narrow `VimAPI` interface pins the upstream engine so breaking changes surface at compile time, not at runtime.

## Bundle size

| Measured layer | Size (brotli) |
| -------------- | ------------- |
| core + adapter + engine (consumer bundle) | ~105 KB |
| `statusbar-vanilla` | < 500 B |

The vim engine itself accounts for most of the weight — an unavoidable cost of real vim semantics. `@tiptap/*` are peer deps.

## Roadmap

| Milestone | Status |
| --------- | ------ |
| M1 multi-editor isolation (v0.2.0) | ✅ |
| M2 engine-driven h/j/k/l/i/Esc/b/dd (v0.3.0) | ✅ |
| M3 full motion set + styles (v0.4.0) | ✅ |
| M4 visual mode + markText decorations (v0.5.0) | ✅ |
| M5 ex commands + dialog + search + status bars (v0.6.0) | ✅ |
| M6 full options + clipboard + CI + size-limit (v0.9.0) | ✅ |
| M7 `:help index` conformance + bare-PM pkg + 1.0 (v1.0.0) | ⏳ |

Full plan: `~/.claude/plans/understand-this-project-cuddly-beaver.md` (generated during design).

## Who's using Prose Motions?

| Product | Description |
|---------|-------------|
| [Grit AI](https://gritai.app/) | The AI Note Editor |

Contributions & ideas are welcome — open an issue or PR.
