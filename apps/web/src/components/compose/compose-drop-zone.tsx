import { PhotoIcon } from "@heroicons/react/24/solid"
import { cn } from "@workspace/ui/lib/utils"
import { MAX_ATTACHMENTS } from "./types"

interface ComposeDropZoneProps {
	isDragging: boolean
	attachmentCount: number
}

export function ComposeDropZone({ isDragging, attachmentCount }: ComposeDropZoneProps) {
	return (
		<div
			className={cn(
				"grid transition-[grid-template-rows] duration-200 ease-out-expo",
				isDragging && attachmentCount < MAX_ATTACHMENTS
					? "grid-rows-[1fr]"
					: "grid-rows-[0fr]",
			)}
		>
			<div className={cn("min-h-0", !(isDragging && attachmentCount < MAX_ATTACHMENTS) && "pointer-events-none")}>
				<div
					className={cn(
						"mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-strong bg-subtle py-10 origin-top transition-all duration-200 ease-out-expo",
						isDragging && attachmentCount < MAX_ATTACHMENTS
							? "opacity-100 scale-100 translate-y-0"
							: "opacity-0 scale-95 -translate-y-1",
					)}
				>
					<PhotoIcon className="size-8 text-tertiary" />
					<span className="mt-2 text-sm text-tertiary">Drop images here</span>
				</div>
			</div>
		</div>
	)
}
