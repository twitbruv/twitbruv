import { createContext, useContext, useLayoutEffect, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

export type AppPageHeaderSpec = {
  title: ReactNode
  action?: ReactNode
  className?: string
  plainTitle?: boolean
} | null

type AppPageHeaderContextValue = {
  header: AppPageHeaderSpec
  setPageHeader: (value: AppPageHeaderSpec) => void
}

const AppPageHeaderContext = createContext<AppPageHeaderContextValue | null>(
  null
)

export function AppPageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setPageHeader] = useState<AppPageHeaderSpec>(null)
  return (
    <AppPageHeaderContext.Provider value={{ header, setPageHeader }}>
      {children}
    </AppPageHeaderContext.Provider>
  )
}

export function useAppPageHeaderState() {
  return useContext(AppPageHeaderContext)
}

export function usePageHeader(spec: AppPageHeaderSpec) {
  const ctx = useContext(AppPageHeaderContext)
  useLayoutEffect(() => {
    if (!ctx) return
    ctx.setPageHeader(spec)
    return () => {
      ctx.setPageHeader(null)
    }
  }, [ctx, spec])
}

export function AppPageHeaderContent({
  spec,
  className,
}: {
  spec: AppPageHeaderSpec
  className?: string
}) {
  if (!spec) return null
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        spec.className,
        className
      )}
    >
      <div className={spec.plainTitle ? "min-w-0 flex-1" : "min-w-0"}>
        {spec.plainTitle ? (
          spec.title
        ) : (
          <h1 className="text-base leading-tight font-semibold text-foreground">
            {spec.title}
          </h1>
        )}
      </div>
      {spec.action ? <div className="shrink-0">{spec.action}</div> : null}
    </div>
  )
}
