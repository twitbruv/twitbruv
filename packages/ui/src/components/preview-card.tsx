import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"
import { createContext, useContext, useMemo } from "react"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, ReactNode } from "react"

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const DURATION = "duration-[300ms]"
const EASING = "ease-[cubic-bezier(0.22,1,0.36,1)]"

const groupPositionerClasses = cn(
  "isolate z-50",
  "h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)",
  `transition-[top,left,right,bottom,transform] ${DURATION} ${EASING}`,
  "data-instant:transition-none"
)

const groupPopupClasses = cn(
  "relative z-50 overflow-clip rounded-xl border border-neutral bg-base-1 shadow-lg",
  "h-(--popup-height,auto) w-(--popup-width,auto)",
  "origin-(--transform-origin)",
  `transition-[width,height,opacity,scale] ${DURATION} ${EASING}`,
  "data-starting-style:translate-y-0.5 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
  "data-ending-style:translate-y-0.5 data-ending-style:scale-[0.97] data-ending-style:opacity-0",
  "data-instant:transition-none"
)

const viewportClasses = cn(
  "relative h-full w-full overflow-clip",

  `[&_[data-current]]:w-[var(--popup-width)]`,
  `[&_[data-current]]:translate-x-0 [&_[data-current]]:opacity-100`,
  `[&_[data-current]]:transition-[translate,opacity] [&_[data-current]]:${DURATION} [&_[data-current]]:${EASING}`,

  `[&_[data-previous]]:w-[var(--popup-width)]`,
  `[&_[data-previous]]:translate-x-0 [&_[data-previous]]:opacity-100`,
  `[&_[data-previous]]:transition-[translate,opacity] [&_[data-previous]]:${DURATION} [&_[data-previous]]:${EASING}`,

  "data-[activation-direction~='left']:[&_[data-current][data-starting-style]]:-translate-x-1/3",
  "data-[activation-direction~='left']:[&_[data-current][data-starting-style]]:opacity-0",
  "data-[activation-direction~='left']:[&_[data-previous][data-ending-style]]:translate-x-1/3",
  "data-[activation-direction~='left']:[&_[data-previous][data-ending-style]]:opacity-0",

  "data-[activation-direction~='right']:[&_[data-current][data-starting-style]]:translate-x-1/3",
  "data-[activation-direction~='right']:[&_[data-current][data-starting-style]]:opacity-0",
  "data-[activation-direction~='right']:[&_[data-previous][data-ending-style]]:-translate-x-1/3",
  "data-[activation-direction~='right']:[&_[data-previous][data-ending-style]]:opacity-0",

  "[[data-instant]_&_[data-previous]]:transition-none",
  "[[data-instant]_&_[data-current]]:transition-none"
)

// ---------------------------------------------------------------------------
// Group context
// ---------------------------------------------------------------------------

interface GroupContext<TPayload> {
  handle: PreviewCardPrimitive.Handle<TPayload>
}

const GroupCtx = createContext<GroupContext<unknown> | null>(null)

// ---------------------------------------------------------------------------
// PreviewCard.Group
// ---------------------------------------------------------------------------

export interface PreviewCardGroupProps<TPayload = unknown> {
  /** Which side of the trigger to place the card */
  side?: "top" | "bottom" | "left" | "right"
  /** Alignment relative to the trigger */
  align?: "start" | "center" | "end"
  /** Offset from the trigger in px */
  sideOffset?: number
  /** Fixed width class for the popup (e.g. "w-72"). When set, disables dynamic width transitions. */
  width?: string
  /** Render function receiving the active trigger's payload */
  children: ReactNode
  /** Render the popup content for the active payload */
  renderContent: (payload: TPayload) => ReactNode
}

function PreviewCardGroup<TPayload>({
  side = "bottom",
  align = "center",
  sideOffset = 8,
  width,
  children,
  renderContent,
}: PreviewCardGroupProps<TPayload>) {
  const handle = useMemo(
    () => PreviewCardPrimitive.createHandle<TPayload>(),
    []
  )

  return (
    <GroupCtx.Provider value={{ handle }}>
      {children}

      <PreviewCardPrimitive.Root handle={handle}>
        {({ payload }) => (
          <PreviewCardPrimitive.Portal keepMounted>
            <PreviewCardPrimitive.Positioner
              side={side}
              align={align}
              sideOffset={sideOffset}
              className={groupPositionerClasses}
            >
              <PreviewCardPrimitive.Popup
                className={cn(groupPopupClasses, width)}
              >
                <PreviewCardPrimitive.Viewport className={viewportClasses}>
                  {payload !== undefined && renderContent(payload)}
                </PreviewCardPrimitive.Viewport>
              </PreviewCardPrimitive.Popup>
            </PreviewCardPrimitive.Positioner>
          </PreviewCardPrimitive.Portal>
        )}
      </PreviewCardPrimitive.Root>
    </GroupCtx.Provider>
  )
}

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
  const group = useContext(GroupCtx)

  if (group) {
    return (
      <PreviewCardPrimitive.Trigger
        handle={group.handle}
        delay={delay}
        closeDelay={closeDelay}
        className={cn("outline-none", className)}
        {...props}
      />
    )
  }

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
  /** Side relative to the trigger */
  side?: "top" | "bottom" | "left" | "right"
  /** Alignment relative to the trigger */
  align?: "start" | "center" | "end"
  /** Offset from the trigger in px */
  sideOffset?: number
  className?: string
  children: ReactNode
}

function PreviewCardContent({
  side = "bottom",
  align = "start",
  sideOffset = 8,
  className,
  children,
}: PreviewCardContentProps) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
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
  Group: PreviewCardGroup,
}
