// Single chokepoint for the upstream vim engine.
//
// We deliberately re-export only the pieces of `@replit/codemirror-vim` we
// actually call, under our own name, so a breaking change upstream surfaces
// here as a TypeScript error instead of breaking every consumer.
//
// License: upstream is MIT — same as @prose-motions/*.
import { Vim as UpstreamVim } from '@replit/codemirror-vim'

export const Vim = UpstreamVim

/**
 * The subset of the upstream `Vim` object our adapter depends on. Listed here
 * so a new overload or removed method upstream is caught at compile time.
 */
export interface VimAPI {
	enterVimMode: (cm: unknown) => void
	leaveVimMode: (cm: unknown) => void
	handleKey: (cm: unknown, key: string, origin: string) => boolean | undefined
	map: (lhs: string, rhs: string, ctx?: string) => void
	unmap: (lhs: string, ctx?: string) => void
	defineEx: (name: string, prefix: string | undefined, func: (cm: unknown, params: unknown) => void) => void
	exitInsertMode: (cm: unknown, keepCursor?: boolean) => void
	exitVisualMode: (cm: unknown, moveHead?: boolean) => void
}

// Static check: upstream Vim has to satisfy our narrowed contract.
const _typecheck: VimAPI = UpstreamVim as unknown as VimAPI
void _typecheck

export const ENGINE_VERSION = '0.1.0-m2'
