import { Link, useLocation, useRouter } from "@tanstack/react-router"
import {
  DesktopIcon,
  DotsThreeCircleIcon,
  GearIcon,
  MoonIcon,
  ShieldIcon,
  SignOutIcon,
  SunIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { APP_NAV_ITEMS } from "../lib/app-nav-items"
import {
  useUnreadDms,
  useUnreadNotifications,
} from "../hooks/use-app-nav-badges"
import { useMobileKeyboardOpen } from "../hooks/use-mobile-keyboard-open"
import { authClient } from "../lib/auth"
import { useMe } from "../lib/me"
import { useTheme } from "../lib/theme"
import { Avatar } from "./avatar"
import { VerifiedBadge } from "./verified-badge"
import type { Theme } from "../lib/theme"
import type { SelfUser } from "../lib/api"

const DOCK_ITEMS = APP_NAV_ITEMS.filter(
  (i): i is Extract<(typeof APP_NAV_ITEMS)[number], { mobileDock: true }> =>
    "mobileDock" in i
)

const MORE_SHEET_ITEMS = APP_NAV_ITEMS.filter((i) => !("mobileDock" in i))

const THEME_TOGGLE_ITEM_CLASS =
  "flex min-h-9 flex-1 flex-row items-center justify-center gap-1.5 px-1 py-1.5 font-normal"

function pathActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/"
  return pathname === to || pathname.startsWith(`${to}/`)
}

type DockItem = (typeof DOCK_ITEMS)[number]

function DockNavLink({
  item,
  pathname,
  unread,
}: {
  item: DockItem
  pathname: string
  unread: number
}) {
  const active = pathActive(pathname, item.to)
  const count = "badge" in item ? unread : 0
  const Icon = item.icon

  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={cn(
        "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground",
        active && "text-primary"
      )}
    >
      <span className="relative inline-flex">
        <Icon className="size-6" />
        {count > 0 && (
          <Badge
            variant="default"
            className="absolute -top-1 -right-2 min-w-4 justify-center px-0.5 py-0 text-[9px] tabular-nums"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </span>
    </Link>
  )
}

function DockBar({
  pathname,
  unread,
  dmUnread,
}: {
  pathname: string
  unread: number
  dmUnread: number
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-sm md:hidden"
      aria-label="Primary"
    >
      {DOCK_ITEMS.map((item) => (
        <DockNavLink
          key={item.to}
          item={item}
          pathname={pathname}
          unread={unread}
        />
      ))}
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-haspopup="dialog"
            aria-label="More navigation"
            className="relative min-h-14 min-w-0 flex-1 flex-col gap-0.5 rounded-none text-muted-foreground"
          >
            <span className="relative inline-flex">
              <DotsThreeCircleIcon className="size-6" />
              {dmUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
              )}
            </span>
          </Button>
        }
      />
    </nav>
  )
}

function OverflowMenu({
  me,
  unread,
  dmUnread,
  onClose,
}: {
  me: SelfUser | null
  unread: number
  dmUnread: number
  onClose: () => void
}) {
  return (
    <SidebarMenu>
      {MORE_SHEET_ITEMS.map((item) => {
        if ("kind" in item) {
          if (!me?.handle) return null
          return (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                size="default"
                render={
                  <Link
                    to="/$handle"
                    params={{ handle: me.handle }}
                    onClick={onClose}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          )
        }

        const count = !("badge" in item)
          ? 0
          : item.badge === "notifications"
            ? unread
            : dmUnread

        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              size="default"
              render={
                <Link to={item.to} onClick={onClose}>
                  <item.icon />
                  <span>{item.label}</span>
                  {count > 0 && (
                    <Badge
                      className="ml-auto min-w-5 tabular-nums group-data-[collapsible=icon]:hidden"
                      variant="default"
                    >
                      {count > 99 ? "99+" : count}
                    </Badge>
                  )}
                </Link>
              }
            />
          </SidebarMenuItem>
        )
      })}
      {(me?.role === "admin" || me?.role === "owner") && (
        <SidebarMenuItem>
          <SidebarMenuButton
            size="default"
            render={
              <Link to="/admin" onClick={onClose}>
                <ShieldIcon />
                <span>Admin</span>
              </Link>
            }
          />
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  )
}

function SheetThemeToggle({
  theme,
  setTheme,
}: {
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  return (
    <SidebarGroup className="px-0 py-1">
      <SidebarGroupLabel>Theme</SidebarGroupLabel>
      <SidebarGroupContent className="px-0">
        <ToggleGroup
          variant="outline"
          spacing={0}
          multiple={false}
          value={[theme]}
          onValueChange={(next) => {
            const v = next[0] as Theme | undefined
            if (v) setTheme(v)
          }}
          className="w-full px-1"
        >
          <ToggleGroupItem
            value="light"
            aria-label="Light theme"
            className={THEME_TOGGLE_ITEM_CLASS}
          >
            <SunIcon />
            <span>Light</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="dark"
            aria-label="Dark theme"
            className={THEME_TOGGLE_ITEM_CLASS}
          >
            <MoonIcon />
            <span>Dark</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="system"
            aria-label="System theme"
            className={THEME_TOGGLE_ITEM_CLASS}
          >
            <DesktopIcon />
            <span>System</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SheetPreferences({
  theme,
  setTheme,
  onClose,
}: {
  theme: Theme
  setTheme: (t: Theme) => void
  onClose: () => void
}) {
  return (
    <>
      <Separator className="my-2" />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="default"
            render={
              <Link to="/settings" onClick={onClose}>
                <GearIcon />
                <span>Settings</span>
              </Link>
            }
          />
        </SidebarMenuItem>
      </SidebarMenu>
      <SheetThemeToggle theme={theme} setTheme={setTheme} />
    </>
  )
}

function SheetUserFooter({
  me,
  onSignOut,
}: {
  me: SelfUser
  onSignOut: () => void
}) {
  const initial = (me.displayName ?? me.handle ?? me.email)
    .slice(0, 1)
    .toUpperCase()

  return (
    <div className="border-t border-border px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar initial={initial} src={me.avatarUrl} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium">
              <span className="truncate">
                {me.displayName || (me.handle ? `@${me.handle}` : "set a name")}
              </span>
              {me.isVerified && <VerifiedBadge size={14} role={me.role} />}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {me.handle ? `@${me.handle}` : me.email}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-9 shrink-0 gap-1.5 rounded-md px-3"
          onClick={onSignOut}
        >
          <SignOutIcon data-icon="inline-start" />
          Sign out
        </Button>
      </div>
    </div>
  )
}

function MoreMenuSheet({
  me,
  unread,
  dmUnread,
  theme,
  setTheme,
  onClose,
  onSignOut,
}: {
  me: SelfUser | null
  unread: number
  dmUnread: number
  theme: Theme
  setTheme: (t: Theme) => void
  onClose: () => void
  onSignOut: () => void
}) {
  return (
    <SheetContent
      side="bottom"
      showCloseButton
      className="max-h-[min(85dvh,32rem)] gap-0 overflow-hidden rounded-t-xl p-0"
    >
      <SheetHeader className="sr-only">
        <SheetTitle>More navigation</SheetTitle>
        <SheetDescription>
          Additional navigation links and account actions.
        </SheetDescription>
      </SheetHeader>
      <div className="flex max-h-[min(85dvh,32rem)] flex-col pt-12">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          <OverflowMenu
            me={me}
            unread={unread}
            dmUnread={dmUnread}
            onClose={onClose}
          />
          {me ? (
            <SheetPreferences
              theme={theme}
              setTheme={setTheme}
              onClose={onClose}
            />
          ) : null}
        </div>
        {me ? <SheetUserFooter me={me} onSignOut={onSignOut} /> : null}
      </div>
    </SheetContent>
  )
}

export function MobileTabBar({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const { pathname, search } = useLocation()
  const { me } = useMe()
  const { theme, setTheme } = useTheme()
  const unread = useUnreadNotifications(enabled)
  const dmUnread = useUnreadDms(enabled)
  const keyboardOpen = useMobileKeyboardOpen()
  const [moreOpen, setMoreOpen] = useState(false)

  async function signOut() {
    await authClient.signOut()
    router.invalidate()
    setMoreOpen(false)
  }

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname, search])

  if (keyboardOpen) return null

  const closeMore = () => setMoreOpen(false)

  return (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <DockBar pathname={pathname} unread={unread} dmUnread={dmUnread} />
      <MoreMenuSheet
        me={me}
        unread={unread}
        dmUnread={dmUnread}
        theme={theme}
        setTheme={setTheme}
        onClose={closeMore}
        onSignOut={() => void signOut()}
      />
    </Sheet>
  )
}
