import {
	type ReactNode,
	type CSSProperties,
	useState,
	useRef,
	useCallback,
	useLayoutEffect,
} from "react"
import { cn } from "@workspace/ui/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentedControlOption<T extends string = string> {
	value: T
	label?: string
	icon?: ReactNode
}

export interface SegmentedControlProps<T extends string = string> {
	/** Options to display as segments */
	options: SegmentedControlOption<T>[]
	/** Controlled value */
	value?: T
	/** Uncontrolled default value */
	defaultValue?: T
	/** Called when the selected segment changes */
	onValueChange?: (value: T) => void
	/**
	 * Layout mode:
	 * - `fill` - segments divide space equally (default)
	 * - `fit` - segments hug their content
	 */
	layout?: "fill" | "fit"
	/**
	 * Visual variant:
	 * - `solid` (default) - bg-subtle container with bg-base-2 indicator pill
	 * - `ghost` - transparent container with bg-subtle indicator pill
	 */
	variant?: "solid" | "ghost"
	className?: string
}

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

/**
 * Segmented control with a sliding indicator that animates between options.
 *
 * Two layout modes:
 * - `fill` (default) - equal-width segments via CSS grid, indicator positioned with translateX
 * - `fit` - segments size to content, indicator position/width measured from DOM
 */
export function SegmentedControl<T extends string = string>({
	options,
	value: controlledValue,
	defaultValue,
	onValueChange,
	layout = "fill",
	variant = "solid",
	className,
}: SegmentedControlProps<T>) {
	const [internalValue, setInternalValue] = useState<T>(
		() => defaultValue ?? options[0]?.value ?? ("" as T),
	)
	const isControlled = controlledValue !== undefined
	const activeValue = isControlled ? controlledValue : internalValue
	const activeIndex = options.findIndex((o) => o.value === activeValue)

	// Refs for fit-mode DOM measurement
	const containerRef = useRef<HTMLDivElement>(null)
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
	const [indicator, setIndicator] = useState<{
		left: number
		width: number
	} | null>(null)
	// Track whether we've done the initial measurement so we can skip the
	// transition on mount (prevents the indicator "sliding in from nowhere").
	const hasMeasuredRef = useRef(false)

	const measure = useCallback(() => {
		if (layout !== "fit") return
		const btn = buttonRefs.current[activeIndex]
		if (!btn) return
		const wasFirst = !hasMeasuredRef.current
		hasMeasuredRef.current = true
		setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth })
		if (wasFirst) {
			void btn.offsetHeight
		}
	}, [activeIndex, layout])

	useLayoutEffect(() => {
		measure()

		const container = containerRef.current
		if (!container || layout !== "fit") return

		const ro = new ResizeObserver(measure)
		ro.observe(container)
		return () => ro.disconnect()
	}, [measure, layout])

	function handleSelect(value: T) {
		if (!isControlled) setInternalValue(value)
		onValueChange?.(value)
	}

	// Indicator styles
	const isFill = layout === "fill"
	const count = options.length

	const indicatorStyle: CSSProperties = isFill
		? {
				width: `calc(100% / ${count})`,
				transform: `translateX(${activeIndex * 100}%)`,
			}
		: indicator
			? {
					left: indicator.left,
					width: indicator.width,
					transition: hasMeasuredRef.current ? undefined : "none",
				}
			: { opacity: 0 }

	const isGhost = variant === "ghost"
	const radius = isGhost ? "rounded-lg" : "rounded-[6px]"

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative",
				!isGhost && "rounded-md bg-subtle",
				isFill ? "grid" : "inline-flex",
				className,
			)}
			style={
				isFill
					? { gridTemplateColumns: `repeat(${count}, 1fr)` }
					: undefined
			}
		>
			{/* Sliding indicator */}
			<div
				aria-hidden
				className={cn(
					"absolute inset-y-0",
					isGhost ? "p-0" : "p-0.5",
					"transition-all duration-200 ease-out-expo",
					"motion-reduce:transition-none",
					!isFill && !hasMeasuredRef.current && "transition-none",
				)}
				style={indicatorStyle}
			>
				<div
					className={cn(
						"h-full",
						radius,
						isGhost
							? "bg-subtle"
							: "bg-base-2 shadow-xs",
					)}
				/>
			</div>

			{/* Option buttons */}
			{options.map((option, i) => (
				<button
					key={option.value}
					ref={(el) => {
						buttonRefs.current[i] = el
					}}
					type="button"
					aria-pressed={option.value === activeValue}
					onClick={() => handleSelect(option.value)}
					className={cn(
						"relative z-[1] flex items-center justify-center gap-1.5 h-8",
						isGhost ? "px-3" : "px-2.5",
						radius,
						"text-sm font-medium select-none cursor-pointer",
						"outline-none focus-visible:ring-2 focus-visible:ring-focus",
						"transition-colors duration-150",
						"motion-reduce:transition-none",
						option.value === activeValue
							? "text-primary"
							: "text-tertiary hover:text-secondary",
					)}
				>
					{option.icon && (
						<span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
							{option.icon}
						</span>
					)}
					{option.label && <span>{option.label}</span>}
				</button>
			))}
		</div>
	)
}
