import { Link, useRouter } from "@tanstack/react-router"
import {
  DesktopIcon,
  SignOutIcon,
  MoonIcon,
  GearIcon,
  ShieldIcon,
  SunIcon,
  UserIcon,
} from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { SidebarMenuButton } from "@workspace/ui/components/sidebar"
import { authClient } from "../lib/auth"
import { useTheme } from "../lib/theme"
import { Avatar } from "./avatar"
import { VerifiedBadge } from "./verified-badge"
import type { Theme } from "../lib/theme"
import type { SelfUser } from "../lib/api"

export function UserNav({ user }: { user: SelfUser }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  async function onSignOut() {
    await authClient.signOut()
    router.invalidate()
  }

  const displayName =
    user.displayName || (user.handle ? `@${user.handle}` : "set a name")
  const subtitle = user.handle ? `@${user.handle}` : user.email
  const initial = (user.displayName ?? user.handle ?? user.email)
    .slice(0, 1)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            tooltip={subtitle}
            className="data-[state=open]:bg-accent"
          >
            <Avatar initial={initial} src={user.avatarUrl} />
            <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium">
                <span className="truncate">{displayName}</span>
                {user.isVerified && (
                  <VerifiedBadge size={14} role={user.role} />
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {subtitle}
              </span>
            </div>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-56"
      >
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar initial={initial} src={user.avatarUrl} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium">
              <span className="truncate">{displayName}</span>
              {user.isVerified && <VerifiedBadge size={14} role={user.role} />}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        {user.handle && (
          <DropdownMenuItem
            render={<Link to="/$handle" params={{ handle: user.handle }} />}
          >
            <UserIcon size={16} />
            <span>Profile</span>
          </DropdownMenuItem>
        )}
        {(user.role === "admin" || user.role === "owner") && (
          <DropdownMenuItem render={<Link to="/admin" />}>
            <ShieldIcon size={16} />
            <span>Admin</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem render={<Link to="/settings" />}>
          <GearIcon size={16} />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon theme={theme} />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(v) => setTheme(v as Theme)}
            >
              <DropdownMenuRadioItem value="light">
                <SunIcon size={16} /> <span>Light</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon size={16} /> <span>Dark</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <DesktopIcon size={16} />{" "}
                <span>System</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <SignOutIcon size={16} />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") return <MoonIcon size={16} />
  if (theme === "light") return <SunIcon size={16} />
  return <DesktopIcon size={16} />
}
