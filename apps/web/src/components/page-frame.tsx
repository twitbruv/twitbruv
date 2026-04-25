import type { ReactNode } from "react"

const base = "mx-auto w-full min-w-0 md:max-w-[640px] md:border-x border-border"

export function PageFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className ? `${base} ${className}` : base}>{children}</div>
  )
}
