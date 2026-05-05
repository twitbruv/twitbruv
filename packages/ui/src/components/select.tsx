import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "./button"
import type { ButtonSize } from "./button"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "sm",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: ButtonSize
}) {
  return (
    <SelectPrimitive.Trigger
      render={
        <Button
          variant="outline"
          size={size}
          iconRight={
            <SelectPrimitive.Icon
              render={<ChevronDownIcon className="size-3.5 text-tertiary" />}
            />
          }
          className={cn("data-placeholder:text-tertiary", className)}
        />
      }
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          className={cn(
            "flex max-h-(--available-height) min-w-[var(--anchor-width)] flex-col rounded-xl border border-neutral bg-base-2 p-1 shadow-sm",
            "origin-[var(--transform-origin)] will-change-[transform,opacity]",
            "transition-[transform,scale,opacity] duration-200 ease-out-expo",
            "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
            "motion-reduce:transition-none",
            "overflow-y-auto",
            className
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-tertiary select-none",
        className
      )}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "group relative flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary outline-none select-none",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-[inherit] bg-subtle opacity-0",
          "group-data-[highlighted]:opacity-100",
          "transition-[inset] duration-150 ease-out-expo motion-reduce:transition-none",
          "group-active:inset-px"
        )}
      />
      <SelectPrimitive.ItemText className="relative z-[1] flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="relative z-[1] flex items-center justify-center text-tertiary" />
        }
      >
        <CheckIcon className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn("my-1 border-t border-neutral", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
