import { Menu as BaseMenu } from "@base-ui/react/menu"
import { cn } from "@workspace/ui/lib/utils"
import { Menu } from "./menu"
import type { ComponentProps, ReactNode } from "react"

// ---------------------------------------------------------------------------
// DropdownMenu.Root
// ---------------------------------------------------------------------------

export interface DropdownMenuRootProps {
  /** Controlled open state */
  open?: boolean
  /** Uncontrolled default open state */
  defaultOpen?: boolean
  /** Called when open state changes */
  onOpenChange?: (open: boolean) => void
  /** Whether the menu is modal (locks scroll + traps focus). Default true. */
  modal?: boolean
  children: ReactNode
}

function DropdownMenuRoot({
  open,
  defaultOpen,
  onOpenChange,
  modal = true,
  children,
}: DropdownMenuRootProps) {
  return (
    <BaseMenu.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}
      modal={modal}
    >
      {children}
    </BaseMenu.Root>
  )
}

// ---------------------------------------------------------------------------
// DropdownMenu.Trigger
// ---------------------------------------------------------------------------

export interface DropdownMenuTriggerProps extends ComponentProps<
  typeof BaseMenu.Trigger
> {}

function DropdownMenuTrigger({
  className,
  ...props
}: DropdownMenuTriggerProps) {
  return (
    <BaseMenu.Trigger
      className={cn("cursor-pointer outline-none", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// DropdownMenu.Content
// ---------------------------------------------------------------------------

export interface DropdownMenuContentProps {
  /** Side relative to the trigger */
  side?: "top" | "bottom" | "left" | "right"
  /** Alignment relative to the trigger */
  align?: "start" | "center" | "end"
  /** Offset from the trigger in px */
  sideOffset?: number
  /** Minimum width */
  minWidth?: string
  className?: string
  children: ReactNode
}

function DropdownMenuContent({
  side = "bottom",
  align = "end",
  sideOffset = 4,
  minWidth = "min-w-[180px]",
  className,
  children,
}: DropdownMenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        render={<Menu.Positioner />}
      >
        <BaseMenu.Popup
          render={<Menu.Panel minWidth={minWidth} className={className} />}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

// ---------------------------------------------------------------------------
// DropdownMenu.Item
// ---------------------------------------------------------------------------

export interface DropdownMenuItemProps {
  /** Danger styling (red text) */
  variant?: "default" | "danger"
  /** Icon element rendered before the label */
  icon?: ReactNode
  /** Called when the item is clicked */
  onClick?: () => void
  /** Close menu on click. Default true. */
  closeOnClick?: boolean
  /** Whether the item is disabled */
  disabled?: boolean
  className?: string
  children?: ReactNode
}

function DropdownMenuItem({
  variant = "default",
  icon,
  onClick,
  closeOnClick,
  disabled,
  className,
  children,
}: DropdownMenuItemProps) {
  return (
    <BaseMenu.Item
      onClick={onClick}
      closeOnClick={closeOnClick}
      disabled={disabled}
      render={<Menu.Item icon={icon} variant={variant} className={className} />}
    >
      <span className="relative z-[1] flex flex-1 items-center gap-2">
        {children}
      </span>
    </BaseMenu.Item>
  )
}

// ---------------------------------------------------------------------------
// DropdownMenu.Separator
// ---------------------------------------------------------------------------

export interface DropdownMenuSeparatorProps {
  className?: string
}

function DropdownMenuSeparator({ className }: DropdownMenuSeparatorProps) {
  return (
    <BaseMenu.Separator render={<Menu.Separator className={className} />} />
  )
}

// ---------------------------------------------------------------------------
// DropdownMenu.Label
// ---------------------------------------------------------------------------

export interface DropdownMenuLabelProps {
  className?: string
  children: ReactNode
}

function DropdownMenuLabel({ className, children }: DropdownMenuLabelProps) {
  return (
    <BaseMenu.GroupLabel render={<Menu.GroupLabel className={className} />}>
      {children}
    </BaseMenu.GroupLabel>
  )
}

// ---------------------------------------------------------------------------
// DropdownMenu.Group
// ---------------------------------------------------------------------------

export interface DropdownMenuGroupProps {
  className?: string
  children: ReactNode
}

function DropdownMenuGroup({ className, children }: DropdownMenuGroupProps) {
  return (
    <BaseMenu.Group className={cn("flex flex-col", className)}>
      {children}
    </BaseMenu.Group>
  )
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const DropdownMenu = {
  Root: DropdownMenuRoot,
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
  Group: DropdownMenuGroup,
}
