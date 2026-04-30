import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps } from "react"

const textareaStyles = [
  "min-h-20 resize-y rounded-md bg-base-2 px-3 py-2 text-sm text-primary shadow-[var(--shadow-field)]",
  "outline-none",
  "placeholder:text-tertiary",
  "transition-[box-shadow,color,border-color,background-color] duration-150 ease-out-expo",
  "focus-visible:border-neutral-strong focus-visible:ring-2 focus-visible:ring-focus/30",
  "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30",
  "motion-reduce:transition-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
]

export interface TextareaProps extends ComponentProps<"textarea"> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea className={cn(textareaStyles, "w-full", className)} {...props} />
  )
}
