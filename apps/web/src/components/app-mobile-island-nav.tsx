import { motion } from "motion/react"
import { Link } from "@tanstack/react-router"
import {
  BellIcon,
  EnvelopeIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  UserIcon,
} from "@heroicons/react/24/outline"
import {
  BellIcon as BellIconSolid,
  EnvelopeIcon as EnvelopeIconSolid,
  HomeIcon as HomeIconSolid,
  MagnifyingGlassIcon as MagnifyingGlassIconSolid,
  PencilSquareIcon,
  UserIcon as UserIconSolid,
} from "@heroicons/react/24/solid"
import {
  useUnreadDms,
  useUnreadNotifications,
} from "../hooks/use-app-nav-badges"
import { useMe } from "../lib/me"
import { useCompose } from "./compose-provider"
import type { ComponentType } from "react"

interface MobileNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  iconActive: ComponentType<{ className?: string }>
  end?: boolean
  badge?: number
}

function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count)
}

export function AppMobileIslandNav() {
  const { me } = useMe()
  const { open: openCompose } = useCompose()
  const unreadNotifications = useUnreadNotifications(!!me)
  const unreadDms = useUnreadDms(!!me)

  if (!me) return null

  const items: Array<MobileNavItem> = [
    {
      to: "/",
      label: "Home",
      icon: HomeIcon,
      iconActive: HomeIconSolid,
      end: true,
    },
    {
      to: "/search",
      label: "Search",
      icon: MagnifyingGlassIcon,
      iconActive: MagnifyingGlassIconSolid,
    },
    {
      to: "/notifications",
      label: "Notifications",
      icon: BellIcon,
      iconActive: BellIconSolid,
      badge: unreadNotifications,
    },
    {
      to: "/inbox",
      label: "Messages",
      icon: EnvelopeIcon,
      iconActive: EnvelopeIconSolid,
      badge: unreadDms,
    },
    {
      to: me.handle ? `/${me.handle}` : "/",
      label: "Profile",
      icon: UserIcon,
      iconActive: UserIconSolid,
    },
  ]

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-3 md:hidden">
      <div className="mx-auto flex w-full max-w-[400px] flex-col gap-2">
        <div className="grid w-full grid-cols-5">
          <div className="col-span-4" aria-hidden={true} />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => openCompose()}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-subtle text-primary shadow-lg backdrop-blur-[7px]"
              aria-label="Compose post"
            >
              <div
                aria-hidden={true}
                className="pointer-events-none absolute inset-0 rounded-full shadow-(--shadow-mobile-island-inset)"
                style={{
                  maskImage:
                    "linear-gradient(15deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)",
                }}
              />
              <PencilSquareIcon className="relative z-10 size-6" />
            </button>
          </div>
        </div>
        <nav className="relative flex w-full items-center justify-between rounded-full bg-subtle p-0.5 py-1 shadow-lg backdrop-blur-[7px]">
          <div
            aria-hidden={true}
            className="pointer-events-none absolute inset-0 rounded-full shadow-(--shadow-mobile-island-inset)"
            style={{
              maskImage:
                "linear-gradient(15deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)",
            }}
          />

          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.end, includeSearch: false }}
              className="flex min-w-0 flex-1"
            >
              {({ isActive }) => {
                const Icon = isActive ? item.iconActive : item.icon
                const badgeText =
                  typeof item.badge === "number" && item.badge > 0
                    ? formatBadge(item.badge)
                    : null
                return (
                  <span className="relative mx-0.5 flex w-full flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-primary">
                    {isActive ? (
                      <motion.div
                        layoutId="app-mobile-island-nav-active"
                        transition={{
                          type: "spring",
                          stiffness: 600,
                          damping: 40,
                        }}
                        className="pointer-events-none absolute inset-0 rounded-full bg-neutral-400/30"
                      />
                    ) : null}
                    <span className="relative z-10 flex w-full flex-col items-center justify-center gap-0.5 pt-px">
                      <span className="relative">
                        <Icon className="size-5" />
                        {badgeText !== null && (
                          <span className="absolute -top-1 -right-1.5 min-w-[14px] rounded-full bg-danger px-1 text-center text-[7px] leading-[14px] font-semibold text-danger-on">
                            {badgeText}
                          </span>
                        )}
                      </span>
                      <span className="max-w-full truncate px-1 text-[9px]">
                        {item.label}
                      </span>
                    </span>
                  </span>
                )
              }}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
