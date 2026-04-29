import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"

const SQUARES = [
  { id: "s5", x: 128, y: 128 },
  { id: "s6", x: 64, y: 192 },
  { id: "s4", x: 0, y: 128 },
  { id: "s3", x: 64, y: 64 },
  { id: "s1", x: 0, y: 0 },
  { id: "s2", x: 128, y: 0 },
]

const CONNECTORS = [
  { id: "c-s5-s6", type: "asc", x: 128, y: 192 },
  { id: "c-s6-s4", type: "desc", x: 64, y: 192 },
  { id: "c-s4-s3", type: "asc", x: 64, y: 128 },
  { id: "c-s3-s1", type: "desc", x: 64, y: 64 },
  { id: "c-s3-s2", type: "asc", x: 128, y: 64 },
] as const

type Phase = { start: number; end: number; originX: number; originY: number }

const ANIMATION_PHASES: Record<string, Phase> = {
  s5: { start: 0, end: 24, originX: 160, originY: 160 },
  "c-s5-s6": { start: 10, end: 30, originX: 141.5, originY: 178.5 },
  s6: { start: 18, end: 42, originX: 128, originY: 192 },
  "c-s6-s4": { start: 28, end: 48, originX: 77.5, originY: 205.5 },
  s4: { start: 36, end: 60, originX: 64, originY: 192 },
  "c-s4-s3": { start: 46, end: 66, originX: 50.5, originY: 141.5 },
  s3: { start: 54, end: 78, originX: 64, originY: 128 },
  "c-s3-s1": { start: 64, end: 84, originX: 77.5, originY: 77.5 },
  s1: { start: 72, end: 96, originX: 64, originY: 64 },
  "c-s3-s2": { start: 68, end: 88, originX: 114.5, originY: 77.5 },
  s2: { start: 76, end: 100, originX: 128, originY: 64 },
}

type ConnectorProps = { x: number; y: number; style?: CSSProperties }

const AscendingConnector = ({ x, y, style }: ConnectorProps) => (
  <path
    d={`M ${x} ${y - 13.5} A 13.5 13.5 0 0 1 ${x - 13.5} ${y} L ${x - 13.5} ${y + 13.5} L ${x} ${y + 13.5} A 13.5 13.5 0 0 1 ${x + 13.5} ${y} L ${x + 13.5} ${y - 13.5} Z`}
    fill="currentColor"
    style={style}
  />
)

const DescendingConnector = ({ x, y, style }: ConnectorProps) => (
  <path
    d={`M ${x} ${y - 13.5} A 13.5 13.5 0 0 0 ${x + 13.5} ${y} L ${x + 13.5} ${y + 13.5} L ${x} ${y + 13.5} A 13.5 13.5 0 0 0 ${x - 13.5} ${y} L ${x - 13.5} ${y - 13.5} Z`}
    fill="currentColor"
    style={style}
  />
)

type LoaderProps = {
  autoplay?: boolean
  className?: string
  /** Optional text rendered below the icon in a vertical stack. */
  label?: string
}

const BUILD_MS = 500
const HOLD_MS = 100
const FADE_MS = 150
const CYCLE_MS = BUILD_MS + HOLD_MS + FADE_MS

export const LOADER_CYCLE_MS = CYCLE_MS

export function useLoaderVisible(
  active: boolean,
  minMs: number = CYCLE_MS
): boolean {
  const startedAtRef = useRef<number | null>(active ? performance.now() : null)
  const [visible, setVisible] = useState(active)

  useEffect(() => {
    if (active) {
      if (startedAtRef.current === null)
        startedAtRef.current = performance.now()
      setVisible(true)
      return
    }
    if (startedAtRef.current === null) {
      setVisible(false)
      return
    }
    const elapsed = performance.now() - startedAtRef.current
    const remaining = Math.max(0, minMs - elapsed)
    if (remaining === 0) {
      setVisible(false)
      startedAtRef.current = null
      return
    }
    const t = setTimeout(() => {
      setVisible(false)
      startedAtRef.current = null
    }, remaining)
    return () => clearTimeout(t)
  }, [active, minMs])

  return visible
}

export function Loader({ autoplay = false, className, label }: LoaderProps) {
  const [progress, setProgress] = useState(0)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    if (!autoplay) return

    let req: number
    let cycleStart = performance.now()

    const animate = (time: number) => {
      let elapsed = time - cycleStart
      if (elapsed >= CYCLE_MS) {
        cycleStart = time
        elapsed = 0
      }

      if (elapsed < BUILD_MS) {
        setProgress((elapsed / BUILD_MS) * 100)
        setOpacity(1)
      } else if (elapsed < BUILD_MS + HOLD_MS) {
        setProgress(100)
        setOpacity(1)
      } else {
        setProgress(100)
        setOpacity(1 - (elapsed - BUILD_MS - HOLD_MS) / FADE_MS)
      }

      req = requestAnimationFrame(animate)
    }

    req = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(req)
  }, [autoplay])

  const getStyle = (id: string): CSSProperties => {
    const phase = ANIMATION_PHASES[id]
    const { start, end, originX, originY } = phase
    const rawP = (progress - start) / (end - start)
    const p = Math.max(0, Math.min(1, rawP))

    let scale: number
    let phaseOpacity: number
    if (id.startsWith("c-")) {
      scale = 1 - Math.pow(1 - p, 3)
      phaseOpacity = p > 0 ? Math.min(1, p * 4) : 0
    } else {
      const c1 = 2.5
      const c3 = c1 + 1
      scale = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
      phaseOpacity = p > 0 ? 1 : 0
    }

    return {
      transformOrigin: `${originX}px ${originY}px`,
      transform: `scale(${scale})`,
      opacity: phaseOpacity,
      willChange: "transform, opacity",
    }
  }

  const foregroundColor = `color-mix(in oklab, var(--color-gray-3), var(--color-gray-8) ${progress}%)`

  const icon = (
    <svg viewBox="0 0 192 256" className={className} overflow="visible">
      <defs>
        <filter
          id="gooey-blend"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
            result="goo"
          />
        </filter>
      </defs>

      <g opacity="0.05">
        {SQUARES.map((sq) => (
          <rect
            key={`bg-${sq.id}`}
            x={sq.x}
            y={sq.y}
            width="64"
            height="64"
            rx="13.5"
            fill="currentColor"
          />
        ))}
        {CONNECTORS.map((c) => {
          const Comp =
            c.type === "asc" ? AscendingConnector : DescendingConnector
          return <Comp key={`bg-${c.id}`} x={c.x} y={c.y} />
        })}
      </g>

      <g style={{ color: foregroundColor, opacity }} filter="url(#gooey-blend)">
        {SQUARES.map((sq) => (
          <rect
            key={`fg-${sq.id}`}
            x={sq.x}
            y={sq.y}
            width="64"
            height="64"
            rx="13.5"
            fill="currentColor"
            style={getStyle(sq.id)}
          />
        ))}
        {CONNECTORS.map((c) => {
          const Comp =
            c.type === "asc" ? AscendingConnector : DescendingConnector
          return (
            <Comp key={`fg-${c.id}`} x={c.x} y={c.y} style={getStyle(c.id)} />
          )
        })}
      </g>
    </svg>
  )

  if (!label) return icon

  return (
    <div className="flex flex-col items-center gap-3">
      {icon}
      <span className="text-sm text-tertiary">{label}</span>
    </div>
  )
}
