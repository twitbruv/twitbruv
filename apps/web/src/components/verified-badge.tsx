import { IconRosetteDiscountCheckFilled } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"

export function VerifiedBadge({
  size = 16,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <IconRosetteDiscountCheckFilled
      size={size}
      aria-label="Verified account"
      className={cn("inline-block shrink-0 text-sky-500", className)}
    />
  )
}
