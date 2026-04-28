import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

export function PageHeader({
  title,
  description,
  action,
  className,
  sticky,
}: {
  title: ReactNode
  description?: string
  action?: ReactNode
  className?: string
  sticky?: boolean
}) {
  return (
    <header
      className={cn(
        "border-neutral bg-base-1/80 flex flex-col gap-1 border-b px-4 py-3 backdrop-blur-sm",
        sticky && "sticky top-0 z-10",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-base leading-tight font-semibold text-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-xs text-tertiary">{description}</p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function PageError({
  title,
  message,
  className,
}: {
  title?: string
  message: string
  className?: string
}) {
  return (
    <div className={cn("p-4", className)}>
      <Alert variant="destructive" className="text-left">
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  )
}

export function PageLoading({
  label = "Loading…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-6 text-sm text-tertiary",
        className
      )}
    >
      <Spinner className="text-primary" />
      {label}
    </div>
  )
}

export function PageLoadingList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="border-neutral flex items-start gap-3 border-b px-4 py-3"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PageEmpty({
  title,
  description,
  icon,
  actions,
  tone = "soft",
  className,
  children,
}: {
  title: string
  description?: ReactNode
  /** Optional icon rendered in a circular medallion above the title. */
  icon?: ReactNode
  /** Action row rendered below the description. Wrap multiple buttons in a fragment. */
  actions?: ReactNode
  /** Visual treatment. `soft` (default) is borderless on a tinted background; `dashed`
   *  preserves the legacy placeholder look for callers that want it. */
  tone?: "soft" | "dashed" | "plain"
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("px-4 py-10", className)}>
      <Empty
        className={cn(
          "gap-3",
          tone === "soft" && "rounded-lg bg-base-2/50",
          tone === "dashed" && "border border-dashed border-neutral",
          tone === "plain" && "p-2"
        )}
      >
        {icon && (
          <EmptyMedia
            variant="icon"
            className="size-12 rounded-full bg-subtle text-secondary [&_svg:not([class*='size-'])]:size-6"
          >
            {icon}
          </EmptyMedia>
        )}
        <EmptyHeader className="gap-1.5">
          <EmptyTitle className="text-base">{title}</EmptyTitle>
          {description && (
            <EmptyDescription className="text-sm/relaxed">
              {description}
            </EmptyDescription>
          )}
        </EmptyHeader>
        {actions && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        )}
        {children && <div className="w-full max-w-sm">{children}</div>}
      </Empty>
    </div>
  )
}

export function NotFoundPanel({
  title = "Not found",
  message,
  children,
}: {
  title?: string
  message: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Empty className="border-neutral border">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        {children}
      </Empty>
    </div>
  )
}
