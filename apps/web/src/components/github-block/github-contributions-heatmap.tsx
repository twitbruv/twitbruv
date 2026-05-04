import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import NumberFlow from "@number-flow/react"
import { cn } from "@workspace/ui/lib/utils"
import type { GithubContributionWeek, GithubContributions } from "../../lib/api"

const CONTRIBUTION_COLOR_BANDS: Array<{
  min: number
  max: number
  color: string
}> = [
  { min: 1, max: 5, color: "var(--background-color-github-contrib-1)" },
  { min: 6, max: 15, color: "var(--background-color-github-contrib-2)" },
  { min: 16, max: 30, color: "var(--background-color-github-contrib-3)" },
  { min: 31, max: 50, color: "var(--background-color-github-contrib-4)" },
  {
    min: 51,
    max: Number.POSITIVE_INFINITY,
    color: "var(--background-color-github-contrib-5)",
  },
]

const TOOLTIP_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
})
const DAY_LABELS: Array<{ di: number; label: string }> = [
  { di: 1, label: "Mon" },
  { di: 3, label: "Wed" },
  { di: 5, label: "Fri" },
]
const LEGEND_COLORS = CONTRIBUTION_COLOR_BANDS.map((band) => band.color)

interface HoveredContribution {
  x: number
  y: number
  count: number
  date: string
}

interface HeatmapCell {
  key: string
  x: number
  y: number
  fill: string
  ariaLabel: string
}

function contributionDateBounds(weeks: Array<GithubContributionWeek>): {
  min: string
  max: string
} | null {
  let min = ""
  let max = ""
  for (const w of weeks) {
    for (const day of w.days) {
      if (!min || day.date < min) min = day.date
      if (!max || day.date > max) max = day.date
    }
  }
  if (!min) return null
  return { min, max }
}

function utcMonthFullyInRange(
  year: number,
  month: number,
  min: string,
  max: string
): boolean {
  const pad = (n: number) => String(n).padStart(2, "0")
  const first = `${year}-${pad(month + 1)}-01`
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const last = `${year}-${pad(month + 1)}-${pad(lastDay)}`
  return first >= min && last <= max
}

function isCurrentUtcMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getUTCFullYear() === year && now.getUTCMonth() === month
}

function contributionColorForCount(count: number): string {
  if (count <= 0) return "var(--background-color-subtle)"
  for (const band of CONTRIBUTION_COLOR_BANDS) {
    if (count >= band.min && count <= band.max) return band.color
  }
  return (
    CONTRIBUTION_COLOR_BANDS[CONTRIBUTION_COLOR_BANDS.length - 1]?.color ??
    "var(--background-color-github-contrib-5)"
  )
}

function contributionTooltipLabel(count: number, date: string): string {
  const amount = `${count.toLocaleString()} contribution${count === 1 ? "" : "s"}`
  const formattedDate = contributionTooltipDate(date)
  return `${amount} on ${formattedDate}`
}

function contributionTooltipDate(date: string): string {
  return TOOLTIP_DATE_FORMATTER.format(new Date(`${date}T12:00:00Z`))
}

function contributionTooltipDateParts(
  date: string
): Array<Intl.DateTimeFormatPart> {
  return TOOLTIP_DATE_FORMATTER.formatToParts(new Date(`${date}T12:00:00Z`))
}

const HeatmapSvg = memo(function HeatmapSvg({
  width,
  height,
  cells,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  svgRef,
}: {
  width: number
  height: number
  cells: Array<HeatmapCell>
  onMouseEnter: (event: React.MouseEvent<SVGSVGElement>) => void
  onMouseMove: (event: React.MouseEvent<SVGSVGElement>) => void
  onMouseLeave: () => void
  svgRef: React.RefObject<SVGSVGElement | null>
}) {
  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="GitHub contributions over the last year"
      className="block shrink-0"
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {cells.map((cell) => (
        <rect
          key={cell.key}
          x={cell.x}
          y={cell.y}
          width={12}
          height={12}
          rx={4}
          ry={4}
          fill={cell.fill}
          aria-label={cell.ariaLabel}
        />
      ))}
    </svg>
  )
})

export function GithubContributionsHeatmap({
  data,
  stale,
  className,
}: {
  data: GithubContributions
  stale?: boolean
  className?: string
}) {
  const [hoveredContribution, setHoveredContribution] =
    useState<HoveredContribution | null>(null)
  const cell = 12
  const gap = 3
  const cols = data.weeks.length
  const width = cols * (cell + gap) - gap
  const height = 7 * (cell + gap) - gap
  const gutterW = 24
  const labelGraphGap = 10
  const gridInset = gutterW + labelGraphGap

  const monthTicks = useMemo(() => {
    const bounds = contributionDateBounds(data.weeks)
    if (!bounds) return []

    const ticks: Array<{ wi: number; label: string }> = []
    let prevMonth: number | null = null
    data.weeks.forEach((week, wi) => {
      const first = week.days[0]
      const d = new Date(`${first.date}T12:00:00Z`)
      const m = d.getUTCMonth()
      const y = d.getUTCFullYear()
      if (prevMonth !== m) {
        const showFullMonth = utcMonthFullyInRange(y, m, bounds.min, bounds.max)
        const showCurrentPartial = isCurrentUtcMonth(y, m)
        if (showFullMonth || showCurrentPartial) {
          ticks.push({ wi, label: MONTH_LABEL_FORMATTER.format(d) })
        }
        prevMonth = m
      }
    })
    return ticks
  }, [data.weeks])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [showLeftMask, setShowLeftMask] = useState(false)
  const [showRightMask, setShowRightMask] = useState(false)
  const pendingHoverRef = useRef<HoveredContribution | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const updateScrollMasks = useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    const maxScrollLeft = el.scrollWidth - el.clientWidth
    const hasOverflow = maxScrollLeft > 1
    setShowLeftMask(hasOverflow && el.scrollLeft > 1)
    setShowRightMask(hasOverflow && el.scrollLeft < maxScrollLeft - 1)
  }, [])

  useEffect(() => {
    updateScrollMasks()

    const el = scrollRef.current
    if (!el) return

    const resizeObserver = new ResizeObserver(updateScrollMasks)
    resizeObserver.observe(el)
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild)
    }

    window.addEventListener("resize", updateScrollMasks)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateScrollMasks)
    }
  }, [updateScrollMasks, data.weeks])

  const contributionsByWeekAndDay = useMemo(() => {
    return data.weeks.map((week) => {
      const daysByIndex: Array<{ date: string; count: number } | null> =
        Array(7).fill(null)
      for (const day of week.days) {
        const dayIndex = new Date(`${day.date}T12:00:00Z`).getUTCDay()
        daysByIndex[dayIndex] = { date: day.date, count: day.count }
      }
      return daysByIndex
    })
  }, [data.weeks])

  const heatmapCells = useMemo<Array<HeatmapCell>>(
    () =>
      data.weeks.flatMap((week, wi) =>
        week.days.map((day) => {
          const dayIndex = new Date(`${day.date}T12:00:00Z`).getUTCDay()
          return {
            key: `${wi}-${day.date}`,
            x: wi * (cell + gap),
            y: dayIndex * (cell + gap),
            fill: contributionColorForCount(day.count),
            ariaLabel: contributionTooltipLabel(day.count, day.date),
          }
        })
      ),
    [cell, data.weeks, gap]
  )

  const flushPendingHover = useCallback(() => {
    animationFrameRef.current = null
    const pendingHover = pendingHoverRef.current
    if (!pendingHover) return
    setHoveredContribution((prev) => {
      if (
        prev &&
        prev.x === pendingHover.x &&
        prev.y === pendingHover.y &&
        prev.count === pendingHover.count &&
        prev.date === pendingHover.date
      ) {
        return prev
      }
      return pendingHover
    })
  }, [])

  const queueHoverUpdate = useCallback(
    (nextHover: HoveredContribution) => {
      pendingHoverRef.current = nextHover
      if (animationFrameRef.current !== null) return
      animationFrameRef.current = requestAnimationFrame(flushPendingHover)
    },
    [flushPendingHover]
  )

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const updateHoveredContributionFromPointer = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      const svgX = ((event.clientX - rect.left) / rect.width) * width
      const svgY = ((event.clientY - rect.top) / rect.height) * height
      const weekIndex = Math.floor(svgX / (cell + gap))
      const dayIndex = Math.floor(svgY / (cell + gap))
      const hoveredDay = contributionsByWeekAndDay[weekIndex]?.[dayIndex]

      const previousHover = hoveredContribution ?? pendingHoverRef.current
      if (!previousHover && hoveredDay) {
        queueHoverUpdate({
          x: event.clientX,
          y: event.clientY,
          count: hoveredDay.count,
          date: hoveredDay.date,
        })
        return
      }
      if (!previousHover) return

      if (!hoveredDay) {
        queueHoverUpdate({
          ...previousHover,
          x: event.clientX,
          y: event.clientY,
        })
        return
      }
      queueHoverUpdate({
        x: event.clientX,
        y: event.clientY,
        count: hoveredDay.count,
        date: hoveredDay.date,
      })
    },
    [
      cell,
      contributionsByWeekAndDay,
      gap,
      height,
      hoveredContribution,
      queueHoverUpdate,
      width,
    ]
  )

  const handleHeatmapMouseEnter = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      const svgX = ((event.clientX - rect.left) / rect.width) * width
      const svgY = ((event.clientY - rect.top) / rect.height) * height
      const weekIndex = Math.floor(svgX / (cell + gap))
      const dayIndex = Math.floor(svgY / (cell + gap))
      const hoveredDay = contributionsByWeekAndDay[weekIndex]?.[dayIndex]
      if (!hoveredDay) return

      queueHoverUpdate({
        x: event.clientX,
        y: event.clientY,
        count: hoveredDay.count,
        date: hoveredDay.date,
      })
    },
    [cell, contributionsByWeekAndDay, gap, height, queueHoverUpdate, width]
  )

  const handleHeatmapMouseLeave = useCallback(() => {
    pendingHoverRef.current = null
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setHoveredContribution(null)
  }, [])

  return (
    <>
      <div className={cn("flex w-full max-w-full min-w-0 flex-col", className)}>
        <div className="relative w-full max-w-full min-w-0 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={updateScrollMasks}
            className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="w-max">
              <div
                className="relative mb-1 h-3.5"
                style={{ marginLeft: gridInset, width }}
              >
                {monthTicks.map(({ wi, label }) => (
                  <span
                    key={`${wi}-${label}`}
                    className="text-muted-foreground absolute top-0 text-[10px] leading-none tabular-nums"
                    style={{ left: wi * (cell + gap) }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex items-start" style={{ gap: labelGraphGap }}>
                <div
                  className="relative shrink-0"
                  style={{ width: gutterW, height }}
                >
                  {DAY_LABELS.map(({ di, label }) => (
                    <span
                      key={di}
                      className="text-muted-foreground absolute right-0 -translate-y-1/2 text-right text-[10px] leading-none tabular-nums"
                      style={{ top: di * (cell + gap) + cell / 2 }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <HeatmapSvg
                  svgRef={svgRef}
                  width={width}
                  height={height}
                  cells={heatmapCells}
                  onMouseEnter={handleHeatmapMouseEnter}
                  onMouseMove={updateHoveredContributionFromPointer}
                  onMouseLeave={handleHeatmapMouseLeave}
                />
              </div>
            </div>
          </div>
          {showLeftMask && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-8 backdrop-blur-[1px]"
              style={{
                background:
                  "linear-gradient(to right, var(--background-color-base-1), transparent)",
              }}
            />
          )}
          {showRightMask && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 backdrop-blur-[1px]"
              style={{
                background:
                  "linear-gradient(to left, var(--background-color-base-1), transparent)",
              }}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 pl-1.5 text-[10px]">
            <span>Less</span>
            <span className="inline-flex items-center gap-0.5">
              {LEGEND_COLORS.map((color, index) => (
                <span
                  key={index}
                  className="inline-block size-[11px] shrink-0 rounded-[4px]"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span>More</span>
          </div>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 px-1.5 text-[10px]">
            <span>
              <span className="text-foreground font-semibold tabular-nums">
                {data.totalContributions.toLocaleString()}
              </span>{" "}
              contributions this year
            </span>
            {stale && (
              <span className="border-border bg-muted/50 text-muted-foreground rounded-full border px-1.5 py-px text-[10px] tracking-wider uppercase">
                Cached
              </span>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {hoveredContribution && (
          <motion.div
            className="pointer-events-none fixed z-50 rounded-md border border-neutral bg-subtle px-2 py-1 text-[11px] whitespace-nowrap text-primary backdrop-blur-sm"
            initial={{ opacity: 0, filter: "blur(8px)", scale: 0.8 }}
            animate={{
              left: hoveredContribution.x + 12,
              top: hoveredContribution.y + 12,
              opacity: 1,
              filter: "blur(0px)",
              scale: 1,
            }}
            exit={{ opacity: 0, filter: "blur(8px)", scale: 0.8 }}
            transition={{
              type: "spring",
              stiffness: 450,
              damping: 40,
              mass: 0.3,
            }}
            style={{
              boxShadow: "var(--shadow-gh-tooltip)",
            }}
          >
            <div className="inline-flex items-center pr-1.5">
              <motion.span layout className="inline-flex">
                <NumberFlow value={hoveredContribution.count} />
              </motion.span>
              <motion.span layout className="whitespace-pre">
                {" contribution"}
                {hoveredContribution.count === 1 ? "" : "s"}
              </motion.span>
              <motion.span layout className="mx-[0.25ch]">
                on
              </motion.span>
              <motion.span layout className="inline-flex">
                {contributionTooltipDateParts(hoveredContribution.date).map(
                  (part, index) => {
                    if (part.type === "day" || part.type === "year") {
                      const numericPart = Number(part.value)
                      if (!Number.isNaN(numericPart)) {
                        return (
                          <motion.span
                            key={`${part.type}-${index}`}
                            layout
                            className="inline-flex"
                          >
                            <NumberFlow
                              value={numericPart}
                              format={
                                part.type === "year"
                                  ? { useGrouping: false }
                                  : undefined
                              }
                            />
                          </motion.span>
                        )
                      }
                    }
                    if (part.type === "literal" && part.value.includes(",")) {
                      const literalWithoutComma = part.value.replaceAll(",", "")
                      if (!literalWithoutComma) return null
                      return (
                        <motion.span
                          key={`${part.type}-${index}`}
                          layout
                          className="whitespace-pre"
                        >
                          {literalWithoutComma}
                        </motion.span>
                      )
                    }
                    return (
                      <motion.span
                        key={`${part.type}-${index}`}
                        layout
                        className="whitespace-pre"
                      >
                        {part.value}
                      </motion.span>
                    )
                  }
                )}
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
