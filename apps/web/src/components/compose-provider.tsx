import { createContext, useCallback, useContext, useRef, useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@workspace/ui/components/dialog"
import { Compose } from "./compose"
import type { Post } from "../lib/api"
import type { ReactNode } from "react"

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ComposeState {
	quoteOfId?: string
	quoted?: Post
}

interface ComposeContextValue {
	/** Open the compose modal. Pass quote data to start a quote post. */
	open: (opts?: { quoteOfId?: string; quoted?: Post }) => void
}

const ComposeContext = createContext<ComposeContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ComposeProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<ComposeState | null>(null)
	const keyRef = useRef(0)

	const openCompose = useCallback(
		(opts?: { quoteOfId?: string; quoted?: Post }) => {
			keyRef.current += 1
			setState(opts ?? {})
		},
		[],
	)

	const closeCompose = useCallback(() => {
		setState(null)
	}, [])

	return (
		<ComposeContext.Provider value={{ open: openCompose }}>
			{children}
			<Dialog open={state !== null} onOpenChange={(o) => !o && closeCompose()}>
				<DialogContent className="sm:max-w-lg gap-0 p-0">
					<DialogTitle className="sr-only">
						{state?.quoteOfId ? "Quote post" : "Compose post"}
					</DialogTitle>
					{state && (
						<Compose
							key={keyRef.current}
							quoteOfId={state.quoteOfId}
							quoted={state.quoted}
							onCreated={closeCompose}
							autoFocus
						/>
					)}
				</DialogContent>
			</Dialog>
		</ComposeContext.Provider>
	)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCompose(): ComposeContextValue {
	const ctx = useContext(ComposeContext)
	if (!ctx) throw new Error("useCompose must be used within a ComposeProvider")
	return ctx
}
