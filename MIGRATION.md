# Migrating to `@prose-motions/core@1.0`

Nothing in the 0.x line was publicly documented as stable, so the changes below
are best-effort to keep the common entry points working. This doc covers
everything a 0.1.x integrator has to do to land on 1.0.

## TL;DR

```diff
- import { VimMode } from '@prose-motions/core'
+ import { VimMode } from '@prose-motions/core'
+ import '@prose-motions/styles/vim.css'

- extensions: [StarterKit, VimMode]
+ extensions: [
+   StarterKit,
+   VimMode.configure({
+     defaultMode: 'insert',       // new, explicit
+     ex: { handlers: { w: onSave } },
+     clipboard: 'internal',
+     onModeChange: (mode) => /* … */,
+   }),
+ ]
```

Existing code with bare `VimMode` (no `.configure()`) keeps working — new
options all have defaults that match 0.1.x behavior.

## Package split

0.1.x shipped one package. 1.0 splits it into:

| Package | What moved there |
| ------- | ---------------- |
| `@prose-motions/core` | The Tiptap extension (`VimMode`) — same import path |
| `@prose-motions/engine` | `Vim` re-export from `@replit/codemirror-vim` |
| `@prose-motions/adapter` | `CMVimAdapter`, `LineIndex`, `marksPlugin`, `vimKeymapPlugin` |
| `@prose-motions/styles` | Caret / dialog / status bar CSS (opt-in) |
| `@prose-motions/statusbar-vanilla` | DOM mode label |
| `@prose-motions/statusbar-react` | `<VimStatusBar />` |
| `@prose-motions/pm` | Vanilla-PM plugins (no Tiptap) — new path |

Consumers who only use `VimMode` don't have to install anything new; the
extra packages are dependencies of core and get pulled in transitively.

Anyone using `import … from '@prose-motions/core'` is fine.

## Storage shape

`editor.storage.vimMode.state` is still available and still has `.mode` and
`.pendingOp` — but:

- `state.mode` widens from `'normal' | 'insert'` to
  `'normal' | 'insert' | 'visual'` in 1.0 (M4 introduced visual). If you had
  a discriminated check on two values, TypeScript will now flag the missing
  branch.
- `state.pendingOp` is always `null` in 1.0. Pending-op state lives inside
  the engine now; reading it from storage is no longer meaningful. Checks
  like `state.pendingOp?.key === 'd'` always evaluate as "no pending op"
  and should be removed.

New, optional reachable: `editor.storage.vimMode.adapter` (the `CMVimAdapter`
instance) for consumers who want to poke at engine internals.

## Commands

`editor.commands.enterNormalMode()` and `editor.commands.enterInsertMode()` are
unchanged. They now dispatch through the engine under the hood
(`Vim.exitInsertMode` / `Vim.handleKey('i')`), which means:

- The caret-shift on `enterNormalMode` is now the engine's responsibility
  and matches standard vim behavior (moves one char left when leaving
  insert). 0.1.x unconditionally shifted by 1 regardless of mode state.

## Keybindings

0.1.x implemented `h/j/k/l/b/dd` by hand. 1.0 wires everything through a real
vim engine, so the full motion / operator / text-object set from
`:help index` is available — `3w`, `dw`, `ci"`, `gg`, `G`, `f`, `/foo<CR>`,
`.`-repeat, `:w`, and so on.

If you overrode `h` / `j` / `k` / `l` via Tiptap's `addKeyboardShortcuts` in
your own extension, those still win (Tiptap's keymap runs before our
keydown handler for printable keys in Insert mode). In Normal / Visual mode,
our plugin is high-priority and will intercept.

## CSS

Add `@prose-motions/styles/vim.css` to your app to get the vim block caret,
visual selection tint, dialog prompt, and status bar base styles. The CSS
drives off classes the extension adds to the ProseMirror root
(`pm-vim-mode-normal` / `-insert` / `-visual`), so consumers can substitute
their own stylesheet — every class is documented in the styles package.

## Semver policy

1.0 commits to semver on the following public surface:

- `@prose-motions/core` exports: `VimMode`, `VimModeOptions`, `VimState`,
  `vimAdapterOf`, `ExHandler`, `KeyMapping`.
- `editor.storage.vimMode.state.mode` value type (`'normal' | 'insert' | 'visual'`).
- `editor.commands.enterNormalMode` / `enterInsertMode` existence.
- `@prose-motions/adapter` exports: `CMVimAdapter`, `LineIndex`,
  `addMark`, `MarkHandle`, `marksPlugin`, `vimKeymapPlugin`, the exported
  `Pos` helpers.
- `@prose-motions/pm` exports: `vimPlugins`, `vimAdapterOf` (view-keyed).
- `@prose-motions/styles/vim.css` class names.

Breaking changes to any of the above require a major bump. Additions
(new options, new methods) are minor. Bug fixes are patch. Internal
engine upgrade (bumping `@replit/codemirror-vim` minor) is a minor
bump with release notes flagging any observed semantic shifts.

## Known gotchas in 0.1.x that 1.0 fixes

- **Multi-editor `dd` leak** — 0.1.x's `pendingOp` was module-global, so
  pressing `d` in editor A armed `dd` in editor B. 1.0 scopes pending-op
  state per-editor via the engine.
- **`Mod-v` in Insert mode** — 0.1.x had a README roadmap entry about
  paste not working after returning to Insert from Normal. 1.0's keymap
  routes `Mod-v` to Tiptap's native paste only when the engine reports
  Insert mode, so it behaves consistently.
- **`j` / `k` with no line-height** — 0.1.x parsed `lineHeight` from computed
  style and fell back to 20 px, which caused a layout thrash and occasional
  mis-moves. 1.0's `findPosV` is a logical-line step (one vim line per
  textblock), so it never touches layout.
