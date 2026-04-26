"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "@workspace/ui/lib/utils"

function RadioGroup<TValue>({
  className,
  ...props
}: RadioGroupPrimitive.Props<TValue>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem<TValue>({
  className,
  ...props
}: RadioPrimitive.Root.Props<TValue>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer aspect-square size-4 shrink-0 rounded-full border border-input bg-input/20 outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex items-center justify-center after:size-2 after:rounded-full after:bg-primary after:content-['']"
      />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
