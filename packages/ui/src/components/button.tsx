import { Button as BaseButton } from "@base-ui/react/button"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Spinner } from "@workspace/ui/components/spinner"

const variantConfig = {
	primary: {
		active: true,
		bg: "bg-inverse",
		bgClassName:
			"shadow-xs inset-shadow-primary group-hover/btn:bg-inverse/90",
		text: "text-inverse",
	},
	outline: {
		active: true,
		bg: "bg-base-2",
		bgClassName:
			"border border-neutral shadow-xs group-hover/btn:bg-subtle group-active/btn:bg-subtle",
		text: "text-primary",
	},
	secondary: {
		active: true,
		bg: "bg-subtle",
		bgClassName: "group-hover/btn:bg-subtle/70",
		text: "text-primary",
	},
	transparent: {
		active: false,
		bg: "",
		bgClassName: "group-hover/btn:bg-subtle group-active/btn:bg-subtle",
		text: "text-secondary",
	},
	danger: {
		active: true,
		bg: "bg-danger",
		bgClassName:
			"border border-danger shadow-xs group-hover/btn:bg-danger-strong group-active/btn:bg-danger-strong",
		text: "text-danger-on",
	},
	"danger-light": {
		active: true,
		bg: "bg-danger-subtle",
		bgClassName: "group-hover/btn:bg-danger/30 group-active/btn:bg-danger/50",
		text: "text-danger",
	},
	glass: {
		active: true,
		bg: "bg-white/10 backdrop-blur-sm",
		bgClassName: "group-hover/btn:bg-white/20 group-active/btn:bg-white/25",
		text: "text-white/80",
	},
} as const

const sizeStyles = {
	sm: { height: "h-7", padding: "px-1.5", textPadding: "px-1", icon: "w-7" },
	md: { height: "h-8", padding: "px-2", textPadding: "px-1", icon: "w-8" },
} as const

export type ButtonVariant = keyof typeof variantConfig
export type ButtonSize = keyof typeof sizeStyles

export interface ButtonProps extends ComponentProps<typeof BaseButton> {
	/** Visual style variant */
	variant?: ButtonVariant
	/** Size of the button */
	size?: ButtonSize
	/** Icon element rendered before the label */
	iconLeft?: ReactNode
	/** Icon element rendered after the label */
	iconRight?: ReactNode
	/** Show a loading spinner overlay */
	loading?: boolean
}

export function Button({
	variant = "outline",
	size = "md",
	iconLeft,
	iconRight,
	loading = false,
	disabled,
	className,
	children,
	...props
}: ButtonProps) {
	const config = variantConfig[variant]
	const s = sizeStyles[size]
	const isIconOnly = !children && !iconRight
	const sizeClass = isIconOnly
		? cn(s.height, s.icon)
		: cn(s.height, s.padding, "w-fit")

	return (
		<BaseButton
			disabled={disabled}
			className={cn(
				"group/btn relative inline-flex min-w-fit cursor-default items-center justify-center",
				"rounded-full text-sm whitespace-pre select-none",
				"ring-focus outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
				disabled && "pointer-events-none opacity-50",
				config.text,
				sizeClass,
				className,
			)}
			{...props}
		>
			{/* Hover/bg layer */}
			<div
				className={cn(
					"absolute rounded-[inherit]",
					config.bg,
					config.bgClassName,
					config.active ? "opacity-100 inset-0" : "opacity-0 inset-1",
					!disabled && [
						"transition-[inset,opacity,background-color] duration-150 ease-out-expo motion-reduce:transition-none",
						"group-hover/btn:inset-0 group-hover/btn:opacity-100",
						"group-active/btn:inset-px",
					],
				)}
			/>

			{iconLeft && (
				<span
					className={cn(
						"relative z-[1] flex size-5 shrink-0 items-center justify-center [&>svg]:size-4",
						loading && "opacity-0",
					)}
				>
					{iconLeft}
				</span>
			)}
			{children && (
				<span
					className={cn(
						"relative z-[1] inline",
						s.textPadding,
						loading && "opacity-0",
					)}
				>
					{children}
				</span>
			)}
			{iconRight && (
				<span
					className={cn(
						"relative z-[1] flex size-5 shrink-0 items-center justify-center [&>svg]:size-4",
						loading && "opacity-0",
					)}
				>
					{iconRight}
				</span>
			)}
			{loading && (
				<span className="absolute inset-0 z-[2] flex items-center justify-center">
					<Spinner size="sm" />
				</span>
			)}
		</BaseButton>
	)
}
