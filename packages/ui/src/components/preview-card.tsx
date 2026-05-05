import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, ReactNode } from "react"

// ---------------------------------------------------------------------------
// PreviewCard.Root
// ---------------------------------------------------------------------------

export interface PreviewCardRootProps extends ComponentProps<
  typeof PreviewCardPrimitive.Root
> {}

function PreviewCardRoot({ children, ...props }: PreviewCardRootProps) {
  return (
    <PreviewCardPrimitive.Root {...props}>{children}</PreviewCardPrimitive.Root>
  )
}

// ---------------------------------------------------------------------------
// PreviewCard.Trigger
// ---------------------------------------------------------------------------

export interface PreviewCardTriggerProps extends ComponentProps<
  typeof PreviewCardPrimitive.Trigger
> {
  /** Delay in ms before the card appears on hover. Default 600. */
  delay?: number
  /** Delay in ms before the card closes after leaving. Default 300. */
  closeDelay?: number
}

function PreviewCardTrigger({
  delay = 600,
  closeDelay = 300,
  className,
  ...props
}: PreviewCardTriggerProps) {
  return (
    <PreviewCardPrimitive.Trigger
      delay={delay}
      closeDelay={closeDelay}
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// PreviewCard.Content
// ---------------------------------------------------------------------------

export interface PreviewCardContentProps {
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  sideOffset?: number
  /** Wider than default `clipping-ancestors` so popovers aren’t squashed in virtual/scroll layouts. */
  collisionBoundary?: Element | "clipping-ancestors"
  positionMethod?: "absolute" | "fixed"
  className?: string
  children: ReactNode
}

function PreviewCardContent({
  side = "bottom",
  align = "start",
  sideOffset = 8,
  collisionBoundary,
  positionMethod,
  className,
  children,
}: PreviewCardContentProps) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        {...(collisionBoundary !== undefined ? { collisionBoundary } : {})}
        {...(positionMethod !== undefined ? { positionMethod } : {})}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          className={cn(
            "w-72 rounded-xl border border-neutral bg-base-1 shadow-lg",
            "origin-(--transform-origin)",
            "transition-[transform,scale,opacity,translate] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-starting-style:translate-y-0.5 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
            "data-ending-style:translate-y-0.5 data-ending-style:scale-[0.97] data-ending-style:opacity-0",
            className
          )}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const PreviewCard = {
  Root: PreviewCardRoot,
  Trigger: PreviewCardTrigger,
  Content: PreviewCardContent,
}
