import type { ReactNode } from "react"

export function FilterField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}
