import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { AppPageHeaderContent, useAppPageHeaderState } from "./app-page-header"

export function AppHeader() {
  const ctx = useAppPageHeaderState()
  return (
    <header className="sticky top-0 z-10 flex justify-center border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex w-full min-w-0 items-center gap-2 px-4 py-2.5">
        <SidebarTrigger className="size-6 shrink-0" />
        {ctx ? <AppPageHeaderContent spec={ctx.header} /> : null}
      </div>
    </header>
  )
}
