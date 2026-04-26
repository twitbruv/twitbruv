import { useCallback, useEffect, useState } from "react"
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import type { ReactNode } from "react"

export interface LightboxImage {
  src: string
  alt?: string
}

/**
 * Wraps a clickable element in a lightbox trigger. Opens a dialog that renders the image
 * full-viewport. When `images.length > 1`, ArrowLeft/ArrowRight (keyboard) and on-screen
 * chevrons step through the gallery.
 */
export function ImageLightbox({
  images,
  initialIndex = 0,
  title = "Image",
  children,
  disabled = false,
  className,
}: {
  images: Array<LightboxImage>
  initialIndex?: number
  title?: string
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(initialIndex)

  // Reset to the clicked image every time we re-open.
  useEffect(() => {
    if (open) setIndex(initialIndex)
  }, [open, initialIndex])

  const canPrev = index > 0
  const canNext = index < images.length - 1

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])
  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : i))
  }, [images.length])

  useEffect(() => {
    if (!open || images.length <= 1) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        goPrev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, images.length, goPrev, goNext])

  if (disabled || images.length === 0) return <>{children}</>

  const current = images[index]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={`cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left ${className ?? ""}`}
          >
            {children}
          </button>
        }
      />
      <DialogContent
        showCloseButton
        className="max-w-[min(92vw,1400px)]! border-0 bg-transparent p-0 shadow-none ring-0"
      >
        <DialogTitle className="sr-only">
          {title}
          {images.length > 1 ? ` (${index + 1} of ${images.length})` : ""}
        </DialogTitle>
        <div className="relative flex items-center justify-center">
          <img
            src={current.src}
            alt={current.alt ?? ""}
            className="max-h-[88vh] w-auto rounded-md object-contain shadow-2xl"
          />
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="previous image"
                onClick={goPrev}
                disabled={!canPrev}
                className="absolute left-2"
              >
                <CaretLeftIcon size={20} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="next image"
                onClick={goNext}
                disabled={!canNext}
                className="absolute right-2"
              >
                <CaretRightIcon size={20} />
              </Button>
              <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                {index + 1} / {images.length}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
