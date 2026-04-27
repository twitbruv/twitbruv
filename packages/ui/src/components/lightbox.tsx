import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
	XMarkIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "@heroicons/react/24/outline"
import { Button } from "@workspace/ui/components/button"

export interface LightboxImage {
	url: string
	alt?: string
}

export interface LightboxProps {
	images: LightboxImage[]
	initialIndex?: number
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Content rendered in the right sidebar (e.g. comments) */
	sidebar?: ReactNode
}

export function Lightbox({
	images,
	initialIndex = 0,
	open,
	onOpenChange,
	sidebar,
}: LightboxProps) {
	const [index, setIndex] = useState(initialIndex)
	const popupRef = useRef<HTMLDivElement>(null)

	// Reset index when opening with a new initialIndex
	useEffect(() => {
		if (open) setIndex(initialIndex)
	}, [open, initialIndex])

	const hasNext = index < images.length - 1
	const hasPrev = index > 0

	const goNext = useCallback(() => {
		setIndex((i) => Math.min(i + 1, images.length - 1))
	}, [images.length])

	const goPrev = useCallback(() => {
		setIndex((i) => Math.max(i - 1, 0))
	}, [])

	// Keyboard handler on the popup element itself (inside the focus trap)
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowRight") {
				e.preventDefault()
				goNext()
			} else if (e.key === "ArrowLeft") {
				e.preventDefault()
				goPrev()
			}
		},
		[goNext, goPrev],
	)

	const current = images[index]

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/90 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
				<DialogPrimitive.Popup
					ref={popupRef}
					onKeyDown={handleKeyDown}
					className="fixed inset-0 z-50 flex overflow-hidden outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
				>
					{/* Image area */}
					<div
						className="relative flex flex-1 items-center justify-center animate-[lightboxContentIn_300ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
						onClick={() => onOpenChange(false)}
					>
					{/* Close button */}
					<Button
						variant="glass"
						size="md"
						onClick={(e) => {
							e.stopPropagation()
							onOpenChange(false)
						}}
						aria-label="Close"
						iconLeft={<XMarkIcon className="size-5" />}
						className="absolute top-4 left-4"
					/>

						{/* Counter */}
						{images.length > 1 && (
							<span className="absolute top-5 left-1/2 -translate-x-1/2 text-sm text-white/70 tabular-nums">
								{index + 1} / {images.length}
							</span>
						)}

					{/* Previous arrow */}
					{hasPrev && (
						<Button
							variant="glass"
							size="md"
							onClick={(e) => {
								e.stopPropagation()
								goPrev()
							}}
							aria-label="Previous image"
							iconLeft={<ChevronLeftIcon className="size-5" />}
							className="absolute left-4 top-1/2 -translate-y-1/2"
						/>
					)}

						{/* Image */}
						{current && (
							<img
								src={current.url}
								alt={current.alt ?? ""}
								onClick={(e) => e.stopPropagation()}
								className="max-h-[90vh] max-w-[90%] select-none rounded-lg object-contain"
								key={current.url}
							/>
						)}

					{/* Next arrow */}
					{hasNext && (
						<Button
							variant="glass"
							size="md"
							onClick={(e) => {
								e.stopPropagation()
								goNext()
							}}
							aria-label="Next image"
							iconLeft={<ChevronRightIcon className="size-5" />}
							className="absolute right-4 top-1/2 -translate-y-1/2"
						/>
					)}
					</div>

					{/* Sidebar (comments) */}
					{sidebar && (
						<div className="hidden shrink-0 p-3 lg:block">
							<div className="h-full w-[380px] overflow-y-auto rounded-2xl bg-base-1 p-2 shadow-lg animate-[lightboxSidebarIn_400ms_cubic-bezier(0.16,1,0.3,1)_forwards]">
								{sidebar}
							</div>
						</div>
					)}
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	)
}

