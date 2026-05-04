import { CheckBadgeIcon } from "@heroicons/react/16/solid"
import { cn } from "@workspace/ui/lib/utils"

export type VerifiedBadgeRole = "user" | "admin" | "owner"

const roleColorClass: Record<VerifiedBadgeRole, string> = {
  user: "text-badge-user",
  admin: "text-badge-admin",
  owner: "text-badge-owner",
}

const roleAriaLabel: Record<VerifiedBadgeRole, string> = {
  user: "Verified account",
  admin: "Verified admin account",
  owner: "Verified owner account",
}

export function VerifiedBadge({
  size,
  role = "user",
  className,
}: {
  size?: number
  role?: VerifiedBadgeRole | null
  className?: string
}) {
  const resolvedRole: VerifiedBadgeRole = role ?? "user"
  return (
    <CheckBadgeIcon
      aria-label={roleAriaLabel[resolvedRole]}
      className={cn(
        "inline-block shrink-0",
        roleColorClass[resolvedRole],
        className
      )}
      style={size !== undefined ? { width: size, height: size } : undefined}
    />
  )
}
