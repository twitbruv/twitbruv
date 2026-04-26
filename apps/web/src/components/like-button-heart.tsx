import { HeartIcon } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

export function useLikeAnimation(durationMs = 600) {
  const [animating, setAnimating] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const trigger = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setAnimating(true)
    timer.current = setTimeout(() => setAnimating(false), durationMs)
  }, [durationMs])

  return { animating, trigger }
}

type Props = {
  liked: boolean
  animating: boolean
  iconSize?: number
  /** Number of particles in the burst (multiples of 8 look cleanest). */
  particleCount?: number
  className?: string
}

export function LikeIconBurst({
  liked,
  animating,
  iconSize = 16,
  particleCount = 8,
  className = "",
}: Props) {
  const showBurst = animating && liked
  const particleSize = Math.max(3, Math.round(iconSize * 0.22))
  const particleTravel = Math.round(iconSize * 1.4)

  // The className "size-[1em]" is intentional: the literal "size-" substring
  // defeats shadcn Button's `[&_svg:not([class*='size-'])]:size-2.5` rule that
  // would otherwise shrink the icon. The actual pixel size is set inline below.
  const sizeClass = "size-[1em]"
  const sizeStyle: CSSProperties = { width: iconSize, height: iconSize }

  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={sizeStyle}
    >
      <span
        className={`relative inline-flex h-full w-full items-center justify-center ${
          animating ? "animate-heart-pop" : ""
        }`}
      >
        <HeartIcon
          className={`${sizeClass} block transition-opacity duration-150 ${
            liked ? "opacity-0" : "opacity-100"
          }`}
          style={sizeStyle}
        />
        <HeartIcon
          weight="fill"
          className={`${sizeClass} pointer-events-none absolute inset-0 m-auto text-rose-500 transition-opacity duration-150 ${
            liked ? "opacity-100" : "opacity-0"
          } ${showBurst ? "animate-heart-wave" : ""}`}
          style={sizeStyle}
        />
      </span>

      {showBurst && (
        <span className="pointer-events-none absolute inset-0 overflow-visible">
          {Array.from({ length: particleCount }).map((_, i) => (
            <span
              key={i}
              className="animate-heart-particle absolute top-1/2 left-1/2 rounded-full bg-rose-500 shadow-[0_0_6px_1px_rgba(244,63,94,0.55)]"
              style={
                {
                  width: particleSize,
                  height: particleSize,
                  "--particle-angle": `${(360 / particleCount) * i}deg`,
                  "--particle-travel": `${particleTravel}px`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  )
}
