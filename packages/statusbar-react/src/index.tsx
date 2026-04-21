import type { StatusBarOptions } from '@prose-motions/statusbar-vanilla'
import type { Editor } from '@tiptap/core'
import type { ReactElement } from 'react'
import { mountStatusBar } from '@prose-motions/statusbar-vanilla'
import { useEffect, useRef } from 'react'

export interface VimStatusBarProps extends StatusBarOptions {
	editor: Editor | null
	/** Class forwarded to the outer React host div (not the bar itself). */
	hostClassName?: string
}

/**
 * React wrapper around the vanilla status bar. Mounts the DOM inside a host
 * div and tears it down on editor change / unmount.
 */
export function VimStatusBar({ editor, hostClassName, ...options }: VimStatusBarProps): ReactElement {
	const host = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		if (!editor || !host.current)
			return
		const handle = mountStatusBar(host.current, editor, options)
		return () => handle.destroy()
	}, [editor, options.labels, options.className])

	return <div ref={host} className={hostClassName} />
}
