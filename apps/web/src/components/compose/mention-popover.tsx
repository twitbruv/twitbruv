import { cn } from "@workspace/ui/lib/utils"
import { Avatar } from "@workspace/ui/components/avatar"
import {
  VerifiedBadge,
  resolveBadgeTier,
} from "../../components/verified-badge"
import { initialFor } from "../../components/user-list"
import type { PublicUser } from "../../lib/api"

interface MentionPopoverProps {
  open: boolean
  users: Array<PublicUser>
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (user: PublicUser) => void
}

export function MentionPopover({
  open,
  users,
  activeIndex,
  onHover,
  onSelect,
}: MentionPopoverProps) {
  if (!open) return null
  return (
    <div className="absolute top-full left-0 z-50 mt-1 w-[min(340px,calc(100%-2rem))]">
      <ul className="overflow-hidden rounded-xl border border-neutral bg-base-2 shadow-sm">
        {users.map((u, i) => {
          const tier = resolveBadgeTier(u)
          const isActive = i === activeIndex
          return (
            <li key={u.id} className="border-b border-neutral last:border-b-0">
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(u)
                }}
                onMouseEnter={() => onHover(i)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                  isActive ? "bg-base-1" : "hover:bg-base-2/30"
                )}
              >
                <Avatar
                  initial={initialFor(u)}
                  src={u.avatarUrl}
                  className="size-9"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm font-medium text-primary">
                    <span className="truncate">
                      {u.displayName || (u.handle ? `@${u.handle}` : u.id)}
                    </span>
                    {tier && <VerifiedBadge size={14} role={tier} />}
                  </div>
                  {u.handle && (
                    <div className="truncate text-xs text-tertiary">
                      @{u.handle}
                    </div>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
