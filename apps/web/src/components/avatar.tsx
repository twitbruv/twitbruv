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
}: {
  initial: string
  src?: string | null
  className?: string
  tone?: keyof typeof tones
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          "size-6 shrink-0 rounded object-cover",
          className,
        )}
      />
    )
  }

  const [bg, fg] = tones[tone]

  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded text-[11px] font-semibold uppercase tracking-tight",
        className,
      )}
      style={{ background: bg, color: fg }}
    >
      {initial}
    </div>
  )
}
