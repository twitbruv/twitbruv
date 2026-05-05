import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "@workspace/ui/lib/utils"

export function RadioGroup<TValue>({
  className,
  ...props
}: RadioGroupPrimitive.Props<TValue>) {
  return (
    <RadioGroupPrimitive className={cn("grid gap-2", className)} {...props} />
  )
}

export function RadioGroupItem<TValue>({
  className,
  ...props
}: RadioPrimitive.Root.Props<TValue>) {
  return (
    <RadioPrimitive.Root
      className={cn(
        "peer aspect-square size-4 shrink-0 rounded-full border border-neutral bg-base-2 transition-colors outline-none",
        "focus-visible:border-neutral-strong focus-visible:ring-2 focus-visible:ring-neutral/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-checked:border-inverse",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="flex h-full w-full items-center justify-center after:size-2 after:rounded-full after:bg-inverse after:content-['']" />
    </RadioPrimitive.Root>
  )
}
