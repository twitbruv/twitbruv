import type { ReactNode } from "react"

const base = "mx-auto w-full min-w-0 mt-4"

const widthClass = {
  narrow: "md:max-w-md",
  default: "md:max-w-feed",
  wide: "md:max-w-4xl",
  marketing: "md:max-w-3xl",
  full: "max-w-none",
} as const

export type PageFrameWidth = keyof typeof widthClass

export function PageFrame({
  children,
  className,
  width = "default",
}: {
  children: ReactNode
  className?: string
  width?: PageFrameWidth
}) {
  const classes = [base, widthClass[width], className].filter(Boolean).join(" ")
  return <div className={classes}>{children}</div>
}
