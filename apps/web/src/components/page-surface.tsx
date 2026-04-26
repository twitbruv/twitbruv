import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
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
        "flex flex-col gap-1 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-sm",
        sticky && "sticky top-0 z-10",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-base leading-tight font-semibold">{title}</h1>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
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
    <p className={cn("px-4 py-6 text-sm text-muted-foreground", className)}>
      {label}
    </p>
  )
}

export function PageLoadingList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-start gap-3 border-b border-border px-4 py-3"
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
  className,
  children,
}: {
  title: string
  description?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("px-4 py-12", className)}>
      <Empty className="border border-dashed border-border">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          {description && <EmptyDescription>{description}</EmptyDescription>}
        </EmptyHeader>
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
    <main className="mx-auto max-w-lg px-4 py-16">
      <Empty className="border border-border">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        {children}
      </Empty>
    </main>
  )
}
