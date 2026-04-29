import { cn } from "@workspace/ui/lib/utils"

export const unfurlCardChromeClasses =
  "mt-3 block max-w-[560px] overflow-hidden rounded-lg border border-neutral bg-base-1 transition-all hover:bg-base-2/60 hover:shadow-sm"

export function UnfurlCardChrome({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-post-card-ignore-open
      onClick={(e) => e.stopPropagation()}
      className={cn(unfurlCardChromeClasses, className)}
    >
      {children}
    </a>
  )
}
