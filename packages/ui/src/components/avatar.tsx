import { useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

const sizeStyles = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-xs",
  md: "size-8 text-sm",
  lg: "size-10 text-base",
  xl: "size-12 text-lg",
} as const

export type AvatarSize = keyof typeof sizeStyles

export interface AvatarProps {
  /** Fallback character(s) when no image */
  initial: string
  /** Image URL */
  src?: string | null
  /** Size variant */
  size?: AvatarSize
  className?: string
}

export function Avatar({ initial, src, size = "md", className }: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const prevSrcRef = useRef(src)

  if (prevSrcRef.current !== src) {
    prevSrcRef.current = src
    setErrored(false)
  }

  if (src && !errored) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover",
          sizeStyles[size],
          className
        )}
        onError={() => setErrored(true)}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-subtle font-semibold text-secondary uppercase",
        sizeStyles[size],
        className
      )}
    >
      {initial}
    </div>
  )
}
