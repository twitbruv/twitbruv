import { cn } from "@workspace/ui/lib/utils"

// Avatar tones matching the design system
const tones = {
  stone: ["oklch(0.88 0.005 80)", "oklch(0.32 0.005 80)"],
  sage: ["oklch(0.86 0.03 160)", "oklch(0.30 0.04 160)"],
  sand: ["oklch(0.88 0.02 70)", "oklch(0.32 0.03 60)"],
  slate: ["oklch(0.85 0.005 250)", "oklch(0.30 0.01 250)"],
  plum: ["oklch(0.85 0.02 320)", "oklch(0.32 0.04 320)"],
} as const

export function Avatar({
  initial,
  src,
  className,
  tone = "stone",
  size,
}: {
  initial: string
  src?: string | null
  className?: string
  tone?: keyof typeof tones
  /** Size in pixels. When provided, font size is calculated dynamically. */
  size?: number
}) {
  const sizeStyle = size ? { width: size, height: size } : undefined
  const fontSize = size ? Math.round(size * 0.46) : undefined
  const letterSpacing = fontSize ? `${-fontSize * 0.02}px` : undefined

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          "shrink-0 rounded object-cover",
          !size && "size-6",
          className
        )}
        style={sizeStyle}
      />
    )
  }

  const [bg, fg] = tones[tone]

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded font-semibold tracking-tight uppercase",
        !size && "size-6 text-[11px]",
        className
      )}
      style={{
        background: bg,
        color: fg,
        ...sizeStyle,
        fontSize,
        letterSpacing,
      }}
    >
      {initial}
    </div>
  )
}
