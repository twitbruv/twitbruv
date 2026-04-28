import { PhotoIcon } from "@heroicons/react/24/solid"
import { cn } from "@workspace/ui/lib/utils"
import { MAX_ATTACHMENTS } from "./types"

interface ComposeDropZoneProps {
  isDragging: boolean
  attachmentCount: number
}

export function ComposeDropZone({
  isDragging,
  attachmentCount,
}: ComposeDropZoneProps) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out-expo",
        isDragging && attachmentCount < MAX_ATTACHMENTS
          ? "grid-rows-[1fr]"
          : "grid-rows-[0fr]"
      )}
    >
      <div
        className={cn(
          "min-h-0",
          !(isDragging && attachmentCount < MAX_ATTACHMENTS) &&
            "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "mt-2 flex origin-top flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-strong bg-subtle py-10 transition-all duration-200 ease-out-expo",
            isDragging && attachmentCount < MAX_ATTACHMENTS
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-95 opacity-0"
          )}
        >
          <PhotoIcon className="size-8 text-tertiary" />
          <span className="mt-2 text-sm text-tertiary">Drop images here</span>
        </div>
      </div>
    </div>
  )
}
