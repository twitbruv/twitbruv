import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { createContext, useContext, useMemo } from "react"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"

// ---------------------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------------------

const DURATION = "duration-[350ms]"
const EASING = "ease-[cubic-bezier(0.22,1,0.36,1)]"

// ---------------------------------------------------------------------------
// Shared popup classes (standalone tooltip)
// ---------------------------------------------------------------------------

const popupClasses = cn(
  "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center rounded-md bg-inverse px-2.5 py-1.5 text-xs leading-tight text-inverse shadow-sm",
  "transition-[transform,scale,opacity] duration-150 ease-out-expo",
  "data-starting-style:scale-90 data-starting-style:opacity-0",
  "data-ending-style:scale-90 data-ending-style:opacity-0",
  "data-instant:transition-none"
)

// ---------------------------------------------------------------------------
// Group classes
// ---------------------------------------------------------------------------

const groupPositionerClasses = cn(
  "isolate z-50",
  "h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)",
  `transition-[top,left,right,bottom,transform] ${DURATION} ${EASING}`,
  "data-instant:transition-none"
)

const groupPopupClasses = cn(
  "relative z-50 overflow-clip rounded-md bg-inverse text-xs leading-tight text-inverse shadow-sm",
  "h-(--popup-height,auto) w-(--popup-width,auto)",
  "origin-(--transform-origin)",
  `transition-[width,height,opacity,scale] ${DURATION} ${EASING}`,
  "data-starting-style:scale-90 data-starting-style:opacity-0",
  "data-ending-style:scale-90 data-ending-style:opacity-0",
  "data-instant:transition-none"
)

// Viewport handles directional content sliding
const viewportClasses = cn(
  "[--vp-px:0.625rem]",
  "relative h-full w-full overflow-clip px-[var(--vp-px)] py-1.5",

  // Current & previous content base transitions
  `[&_[data-current]]:w-[calc(var(--popup-width)-2*var(--vp-px))]`,
  `[&_[data-current]]:translate-x-0 [&_[data-current]]:opacity-100`,
  `[&_[data-current]]:transition-[translate,opacity] [&_[data-current]]:${DURATION} [&_[data-current]]:${EASING}`,

  `[&_[data-previous]]:w-[calc(var(--popup-width)-2*var(--vp-px))]`,
  `[&_[data-previous]]:translate-x-0 [&_[data-previous]]:opacity-100`,
  `[&_[data-previous]]:transition-[translate,opacity] [&_[data-previous]]:${DURATION} [&_[data-previous]]:${EASING}`,

  // Activation direction: left → current enters from left, previous exits right
  "data-[activation-direction~='left']:[&_[data-current][data-starting-style]]:-translate-x-1/2",
  "data-[activation-direction~='left']:[&_[data-current][data-starting-style]]:opacity-0",
  "data-[activation-direction~='left']:[&_[data-previous][data-ending-style]]:translate-x-1/2",
  "data-[activation-direction~='left']:[&_[data-previous][data-ending-style]]:opacity-0",

  // Activation direction: right → current enters from right, previous exits left
  "data-[activation-direction~='right']:[&_[data-current][data-starting-style]]:translate-x-1/2",
  "data-[activation-direction~='right']:[&_[data-current][data-starting-style]]:opacity-0",
  "data-[activation-direction~='right']:[&_[data-previous][data-ending-style]]:-translate-x-1/2",
  "data-[activation-direction~='right']:[&_[data-previous][data-ending-style]]:opacity-0",

  // Skip transitions on instant (first open)
  "[[data-instant]_&_[data-previous]]:transition-none",
  "[[data-instant]_&_[data-current]]:transition-none"
)

// ---------------------------------------------------------------------------
// Group context
// ---------------------------------------------------------------------------

type GroupContext = {
  handle: TooltipPrimitive.Handle<ReactNode>
}

const GroupCtx = createContext<GroupContext | null>(null)

// ---------------------------------------------------------------------------
// Tooltip.Group
// ---------------------------------------------------------------------------

export interface TooltipGroupProps {
  /** Delay in ms before a tooltip appears. Default 0. */
  delay?: number
  /** Delay in ms before a tooltip closes. Default 100. */
  closeDelay?: number
  /**
   * Once a tooltip in the group is visible, hovering an adjacent trigger
   * opens instantly if the previous closed within this window (ms).
   * Default 400.
   */
  timeout?: number
  /** Which side of the trigger to place the tooltip */
  side?: "top" | "bottom" | "left" | "right"
  /** Alignment relative to the trigger */
  align?: "start" | "center" | "end"
  /** Offset from the trigger in px */
  sideOffset?: number
  children: ReactNode
}

function TooltipGroup({
  delay = 0,
  closeDelay = 100,
  timeout = 400,
  side = "top",
  align = "center",
  sideOffset = 6,
  children,
}: TooltipGroupProps) {
  const handle = useMemo(() => TooltipPrimitive.createHandle<ReactNode>(), [])

  return (
    <TooltipPrimitive.Provider
      delay={delay}
      closeDelay={closeDelay}
      timeout={timeout}
    >
      <GroupCtx.Provider value={{ handle }}>{children}</GroupCtx.Provider>

      <TooltipPrimitive.Root handle={handle}>
        {({ payload }) => (
          <TooltipPrimitive.Portal keepMounted>
            <TooltipPrimitive.Positioner
              side={side}
              align={align}
              sideOffset={sideOffset}
              className={groupPositionerClasses}
            >
              <TooltipPrimitive.Popup className={groupPopupClasses}>
                <TooltipPrimitive.Viewport className={viewportClasses}>
                  {payload !== undefined && payload}
                </TooltipPrimitive.Viewport>
              </TooltipPrimitive.Popup>
            </TooltipPrimitive.Positioner>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export interface TooltipProps {
  /** The label text shown in the tooltip */
  label: ReactNode
  /** Which side of the trigger to place the tooltip */
  side?: "top" | "bottom" | "left" | "right"
  /** Alignment relative to the trigger */
  align?: "start" | "center" | "end"
  /** Offset from the trigger in px */
  sideOffset?: number
  /** Delay in ms before the tooltip appears */
  delay?: number
  /** The element that triggers the tooltip */
  children: ReactNode
}

function TooltipImpl({
  label,
  side = "top",
  align = "center",
  sideOffset = 6,
  delay = 0,
  children,
}: TooltipProps) {
  const group = useContext(GroupCtx)

  if (group) {
    return (
      <TooltipPrimitive.Trigger
        className="outline-none"
        handle={group.handle}
        payload={label}
        delay={delay}
      >
        {children}
      </TooltipPrimitive.Trigger>
    )
  }

  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger className="outline-none">
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            side={side}
            align={align}
            sideOffset={sideOffset}
            className="isolate z-50"
          >
            <TooltipPrimitive.Popup className={popupClasses}>
              {label}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const Tooltip = Object.assign(TooltipImpl, {
  Group: TooltipGroup,
})
