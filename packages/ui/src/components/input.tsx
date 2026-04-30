import { Field } from "@base-ui/react/field"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, ReactNode } from "react"

const inputStyles = [
  "h-9 rounded-md bg-base-2 px-2.5 text-sm text-primary shadow-[var(--shadow-field)]",
  "outline-none",
  "placeholder:text-tertiary",
  "transition-[box-shadow,color,border-color,background-color] duration-150 ease-out-expo",
  "focus-visible:border-neutral-strong focus-visible:ring-2 focus-visible:ring-focus/30",
  "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30",
  "motion-reduce:transition-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
]

const wrapperStyles = [
  "h-8 rounded-md border border-neutral bg-base-2 text-sm shadow-xs",
  "transition-[box-shadow,color,border-color,background-color] duration-150 ease-out-expo",
  "has-[:focus-visible]:border-neutral-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/30",
  "motion-reduce:transition-none",
  "has-[*[disabled]]:cursor-not-allowed has-[*[disabled]]:opacity-50",
]

export interface InputProps extends ComponentProps<"input"> {
  /** Icon element rendered before the input */
  iconLeft?: ReactNode
  /** Icon element rendered after the input */
  iconRight?: ReactNode
  /** Class for the wrapper div when icons are present */
  wrapperClassName?: string
}

export function Input({
  iconLeft,
  iconRight,
  wrapperClassName,
  className,
  ...props
}: InputProps) {
  const hasIcon = !!iconLeft || !!iconRight

  if (!hasIcon) {
    return <input className={cn(inputStyles, "w-full", className)} {...props} />
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5",
        wrapperStyles,
        wrapperClassName
      )}
    >
      {iconLeft && (
        <span className="flex size-5 shrink-0 items-center justify-center text-secondary [&>svg]:size-4">
          {iconLeft}
        </span>
      )}
      <input
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-tertiary disabled:cursor-not-allowed",
          className
        )}
        {...props}
      />
      {iconRight && (
        <span className="flex size-5 shrink-0 items-center justify-center text-secondary [&>svg]:size-4">
          {iconRight}
        </span>
      )}
    </div>
  )
}

/** Input wired to Base UI Field for form validation */
export interface FormInputProps extends ComponentProps<typeof Field.Control> {
  iconLeft?: ReactNode
  iconRight?: ReactNode
  wrapperClassName?: string
}

export function FormInput({
  iconLeft,
  iconRight,
  wrapperClassName,
  className,
  ...props
}: FormInputProps) {
  const hasIcon = !!iconLeft || !!iconRight

  if (!hasIcon) {
    return (
      <Field.Control
        className={cn(inputStyles, "w-full", className)}
        {...props}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5",
        wrapperStyles,
        wrapperClassName
      )}
    >
      {iconLeft && (
        <span className="flex size-5 shrink-0 items-center justify-center text-secondary [&>svg]:size-4">
          {iconLeft}
        </span>
      )}
      <Field.Control
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-tertiary disabled:cursor-not-allowed",
          className
        )}
        {...props}
      />
      {iconRight && (
        <span className="flex size-5 shrink-0 items-center justify-center text-secondary [&>svg]:size-4">
          {iconRight}
        </span>
      )}
    </div>
  )
}
