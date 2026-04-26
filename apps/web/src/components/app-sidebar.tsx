import { Link } from "@tanstack/react-router"
import { ShieldIcon } from "@phosphor-icons/react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { Badge } from "@workspace/ui/components/badge"
import { APP_NAME } from "../lib/env"
import { APP_NAV_ITEMS } from "../lib/app-nav-items"
import {
  useUnreadDms,
  useUnreadNotifications,
} from "../hooks/use-app-nav-badges"
import { useMe } from "../lib/me"
import { UserNav } from "./user-nav"

export function AppSidebar({ enabled }: { enabled: boolean }) {
  const { me } = useMe()
  const unread = useUnreadNotifications(enabled)
  const dmUnread = useUnreadDms(enabled)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2">
        <Link to="/" aria-label={APP_NAME} className="flex items-center gap-2">
          <div
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          >
            {APP_NAME.slice(0, 1).toLowerCase()}
          </div>
          <span className="text-base font-semibold group-data-[collapsible=icon]:hidden">
            {APP_NAME}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {APP_NAV_ITEMS.map((item) => {
                if ("kind" in item) {
                  if (!me?.handle) return null
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        size="default"
                        tooltip={item.tooltip}
                        render={
                          <Link to="/$handle" params={{ handle: me.handle }}>
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
                      tooltip={item.tooltip}
                      render={
                        <Link to={item.to}>
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
                    tooltip="admin"
                    render={
                      <Link to="/admin">
                        <ShieldIcon />
                        <span>Admin</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {me && (
          <SidebarMenu>
            <SidebarMenuItem>
              <UserNav user={me} />
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
