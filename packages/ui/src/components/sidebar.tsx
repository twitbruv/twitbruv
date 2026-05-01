import {
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  MoonIcon,
  PencilSquareIcon,
  SunIcon,
} from "@heroicons/react/16/solid"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import type { ComponentType, ReactNode } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemeMode = "light" | "dark" | "system"

export interface SidebarNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  iconActive: ComponentType<{ className?: string }>
  /** Only match exact path (e.g. "/" should not match "/search") */
  end?: boolean
  badge?: number
}

function formatNavUnreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count)
}

export interface SidebarUser {
  displayName: string
  handle: string
  avatarUrl: string | null
}

export interface SidebarProps {
  /** Nav items to render in the sidebar */
  navItems: Array<SidebarNavItem>
  /** Render function for router-specific link elements */
  renderLink: (props: {
    to: string
    end?: boolean
    className: (isActive: boolean) => string
    children: (isActive: boolean) => ReactNode
  }) => ReactNode
  /** Current user info for the profile pill and dropdown */
  user: SidebarUser
  /** Current theme mode */
  theme: ThemeMode
  /** Called when theme changes */
  onThemeChange: (theme: ThemeMode) => void
  /** Called when the compose button is clicked */
  onCompose: () => void
  /** Called when settings is clicked */
  onSettings?: () => void
  /** Called when log out is clicked */
  onSignOut?: () => void
  /** Optional logo element. Falls back to the twitbruv logo. */
  logo?: ReactNode
  className?: string
  compact?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const themeOptions = [
  { value: "light" as const, icon: <SunIcon /> },
  { value: "dark" as const, icon: <MoonIcon /> },
  { value: "system" as const, icon: <ComputerDesktopIcon /> },
]

const defaultLogo = (
  <svg className="size-6" viewBox="0 0 193 257" fill="none">
    <path
      d="M127.502 50.3154C127.502 57.7961 121.438 63.8604 113.957 63.8604H78.2862C70.8055 63.8604 64.7412 57.7961 64.7412 50.3154V13.545C64.7412 6.06429 58.6769 0 51.1962 0H13.545C6.06429 0 0 6.06429 0 13.545V51.1962C0 58.6769 6.06429 64.7412 13.545 64.7412H50.0966C57.5773 64.7412 63.6416 70.8055 63.6416 78.2862V113.929C63.6416 121.409 57.5773 127.474 50.0966 127.474H13.545C6.06429 127.474 0 133.538 0 141.019V178.67C0 186.151 6.06429 192.215 13.545 192.215H51.1953C58.6759 192.215 64.7402 198.279 64.7402 205.76V243.411C64.7402 250.892 70.8045 256.956 78.2852 256.956H115.936C123.417 256.956 129.481 250.892 129.481 243.411V207.378C129.481 199.897 135.546 193.833 143.026 193.833H179.059C186.539 193.833 192.604 187.769 192.604 180.288V142.638C192.604 135.157 186.539 129.093 179.059 129.093H141.408C133.928 129.093 127.863 135.157 127.863 142.638V178.67C127.863 186.151 121.799 192.215 114.318 192.215H78.2862C70.8055 192.215 64.7412 186.151 64.7412 178.67V142.147C64.7412 134.666 70.8055 128.602 78.2862 128.602H114.838C122.319 128.602 128.383 122.537 128.383 115.057V78.2862C128.383 70.8055 134.447 64.7412 141.928 64.7412H178.698C186.179 64.7412 192.243 58.6769 192.243 51.1962V13.545C192.243 6.06429 186.179 0 178.698 0H141.047C133.566 0 127.502 6.06429 127.502 13.545V50.3154Z"
      fill="currentColor"
    />
  </svg>
)

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  navItems,
  renderLink,
  user,
  theme,
  onThemeChange,
  onCompose,
  onSettings,
  onSignOut,
  logo,
  className,
  compact = false,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh w-[68px] shrink-0 flex-col items-center justify-between overflow-y-auto py-4",
        !compact && "xl:w-[240px] xl:items-start xl:px-3",
        className
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center text-primary",
          !compact && "xl:ml-1"
        )}
      >
        {logo ?? defaultLogo}
      </div>

      {/* Nav links */}
      <nav
        className={cn(
          "mt-2 flex flex-1 flex-col items-center gap-1",
          !compact && "xl:w-full xl:items-stretch"
        )}
      >
        {navItems.map((item) => (
          <div key={item.to}>
            {renderLink({
              to: item.to,
              end: item.end,
              className: (isActive) =>
                cn(
                  "group flex size-11 items-center justify-center rounded-full transition-colors hover:bg-subtle",
                  !compact && "xl:w-full xl:justify-start xl:gap-4 xl:px-3",
                  isActive && "font-semibold"
                ),
              children: (isActive) => {
                const IconActive = item.iconActive
                const Icon = item.icon
                const badge =
                  typeof item.badge === "number" && item.badge > 0
                    ? item.badge
                    : null
                const badgeLabel =
                  badge != null ? formatNavUnreadBadge(badge) : null
                return (
                  <>
                    {compact ? (
                      <span className="sr-only">{item.label}</span>
                    ) : null}
                    <span className="relative shrink-0">
                      {isActive ? (
                        <IconActive className="size-6 text-primary" />
                      ) : (
                        <Icon className="size-6 text-primary" />
                      )}
                      {badgeLabel != null && badge != null && (
                        <>
                          <span className="sr-only">{`${badge} unread`}</span>
                          <span
                            aria-hidden
                            className={cn(
                              "absolute -top-0.5 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger px-[3px] text-[9px] leading-none font-semibold text-danger-on",
                              !compact && "xl:hidden"
                            )}
                          >
                            {badgeLabel}
                          </span>
                        </>
                      )}
                    </span>
                    <span
                      className={cn(
                        "hidden min-w-0 flex-1 items-center justify-between gap-2",
                        !compact && "xl:flex"
                      )}
                    >
                      <span className="truncate text-[15px] text-primary transition-all">
                        {item.label}
                      </span>
                      {badgeLabel != null && badge != null && (
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex min-h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-danger-on",
                            compact && "hidden"
                          )}
                        >
                          {badgeLabel}
                        </span>
                      )}
                    </span>
                  </>
                )
              },
            })}
          </div>
        ))}

        {/* Compose button */}
        <div
          className={cn(
            "mt-4 flex flex-col items-center",
            !compact && "xl:w-full xl:items-stretch"
          )}
        >
          <Button
            variant="primary"
            size="md"
            className={cn("hidden h-11 w-full", !compact && "xl:flex")}
            onClick={onCompose}
          >
            Post
          </Button>
          <Button
            variant="primary"
            size="md"
            className={cn("flex size-11", !compact && "xl:hidden")}
            onClick={onCompose}
            aria-label="Compose post"
          >
            <PencilSquareIcon className="size-5" />
          </Button>
        </div>
      </nav>

      {/* Profile pill / user menu */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={cn(
            "flex items-center gap-3 rounded-full p-2 transition-colors hover:bg-subtle",
            !compact && "xl:w-full",
            compact && "justify-center"
          )}
          aria-label={`Account menu for ${user.displayName}`}
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="size-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-secondary">
              {user.displayName[0]}
            </div>
          )}
          <div
            className={cn("hidden min-w-0 text-left", !compact && "xl:block")}
          >
            <div className="truncate text-sm font-semibold text-primary">
              {user.displayName}
            </div>
            <div className="truncate text-xs text-tertiary">@{user.handle}</div>
          </div>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          minWidth="min-w-[260px]"
        >
          {/* User info header */}
          <div className="flex items-center gap-3 px-2 py-2">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="size-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-secondary">
                {user.displayName[0]}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-primary">
                {user.displayName}
              </span>
              <span className="text-xs text-tertiary">@{user.handle}</span>
            </div>
          </div>

          <DropdownMenu.Separator />

          {/* Appearance toggle */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm text-primary">Appearance</span>
            <SegmentedControl<ThemeMode>
              options={themeOptions}
              value={theme}
              onValueChange={onThemeChange}
            />
          </div>

          {onSettings && (
            <>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                icon={<Cog6ToothIcon className="size-4" />}
                onClick={onSettings}
              >
                Settings
              </DropdownMenu.Item>
            </>
          )}

          {onSignOut && (
            <>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                icon={<ArrowRightStartOnRectangleIcon className="size-4" />}
                variant="danger"
                onClick={onSignOut}
              >
                Log out
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </aside>
  )
}
