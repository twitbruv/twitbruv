import { useCallback } from "react"
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@workspace/ui/components/dialog"
import { Compose } from "./compose"
import type { Post } from "../lib/api"

export interface ComposeModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onCreated?: (post: Post) => void
}

export function ComposeModal({
	open,
	onOpenChange,
	onCreated,
}: ComposeModalProps) {
	const handleCreated = useCallback(
		(post: Post) => {
			onOpenChange(false)
			onCreated?.(post)
		},
		[onOpenChange, onCreated],
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg gap-0 p-0">
				<DialogTitle className="sr-only">Compose post</DialogTitle>
				<Compose onCreated={handleCreated} autoFocus />
			</DialogContent>
		</Dialog>
	)
}
