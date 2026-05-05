import { CheckBadgeIcon } from "@heroicons/react/16/solid"
import { cn } from "@workspace/ui/lib/utils"

export type VerifiedBadgeRole = "user" | "contributor" | "admin" | "owner"

const roleColorClass: Record<VerifiedBadgeRole, string> = {
  user: "text-badge-user",
  contributor: "text-badge-contributor",
  admin: "text-badge-admin",
  owner: "text-badge-owner",
}

const roleAriaLabel: Record<VerifiedBadgeRole, string> = {
  user: "Verified account",
  contributor: "Contributor",
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

export interface BadgeTierInput {
  isVerified?: boolean | null
  isContributor?: boolean | null
  role?: "user" | "admin" | "owner" | null
}

export function resolveBadgeTier(
  user: BadgeTierInput | null | undefined
): VerifiedBadgeRole | null {
  if (!user) return null
  const role = user.role ?? "user"
  if (role === "owner") return "owner"
  if (role === "admin") return "admin"
  if (user.isContributor) return "contributor"
  if (user.isVerified) return "user"
  return null
}
