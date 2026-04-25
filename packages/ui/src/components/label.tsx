import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps } from "react"

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-xs leading-none font-medium text-foreground/80 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
}

export { Label }
