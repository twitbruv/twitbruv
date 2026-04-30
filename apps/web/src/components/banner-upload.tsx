import { useRef, useState } from "react"
import { CameraIcon, TrashIcon } from "@heroicons/react/24/solid"
import { PhotoIcon } from "@heroicons/react/24/outline"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { pickVariantUrl, uploadImage } from "../lib/media"

export function BannerUpload({
  currentUrl,
  onChange,
  triggerClassName,
}: {
  currentUrl: string | null
  onChange: (nextUrl: string | null) => void
  triggerClassName?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) upload(file)
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/") || uploading) return
    setError(null)
    setUploading(true)
    try {
      const media = await uploadImage(file)
      const url = pickVariantUrl(media, "large")
      if (!url) throw new Error("no variant returned")
      onChange(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed")
    } finally {
      setUploading(false)
    }
  }

  function onDragOver(e: React.DragEvent) {
    if (uploading) return
    if (!Array.from(e.dataTransfer.types).includes("Files")) return
    e.preventDefault()
    setDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files.item(0)
    if (file) upload(file)
  }

  function onPaste(e: React.ClipboardEvent) {
    if (uploading) return
    const files = getPastedImageFiles(e)
    if (files.length === 0) return
    e.preventDefault()
    void upload(files[0])
  }

  const toolbar = (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-3 rounded-full border border-neutral-strong bg-base-1 text-xs backdrop-blur-sm backdrop-saturate-200">
      {uploading && (
        <span className="flex items-center gap-2 text-tertiary">
          <Spinner className="text-primary" />
        </span>
      )}
      {error && <span className="text-danger">{error}</span>}
      {currentUrl && !uploading && (
        <Button
          variant="transparent"
          size="sm"
          onClick={() => onChange(null)}
          className="aspect-square cursor-pointer p-5 text-danger hover:underline"
        >
          <TrashIcon className="size-5" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="relative space-y-2">
      {toolbar}
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onPaste={onPaste}
          className={cn(
            "group relative block h-52 w-full cursor-pointer overflow-hidden rounded-2xl bg-base-0 shadow-banner transition outline-none",
            "focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2",
            dragOver && "border-accent ring-accent ring-2",
            uploading && "cursor-not-allowed opacity-60",
            triggerClassName
          )}
          aria-label="upload banner"
        >
          {currentUrl ? (
            <img
              src={currentUrl}
              alt=""
              className="h-full w-full rounded-b-2xl object-cover"
            />
          ) : (
            <Empty
              className={cn(
                "h-full min-h-0 gap-2 rounded-b-2xl border-0 bg-base-2/40 p-4 sm:p-5",
                dragOver && "bg-accent/10"
              )}
            >
              <EmptyMedia
                variant="icon"
                className="mb-0 size-10 rounded-xl bg-subtle/80 text-secondary [&_svg:not([class*='size-'])]:size-5"
              >
                <PhotoIcon aria-hidden />
              </EmptyMedia>
              <EmptyHeader className="gap-0.5">
                <EmptyTitle className="text-sm">
                  {dragOver ? "Drop to upload" : "Add a banner"}
                </EmptyTitle>
                <EmptyDescription className="max-w-[18rem] text-[11px] text-tertiary sm:text-xs">
                  {dragOver
                    ? "Release to set your profile header image."
                    : "Click, drag and drop, or paste an image to upload as banner."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {currentUrl ? (
            <>
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-b-2xl transition-[opacity,background-color] duration-200 ease-out motion-reduce:transition-none",
                  dragOver
                    ? "bg-accent/10 opacity-100"
                    : "bg-base-1/0 opacity-0 group-hover:bg-base-1/30 group-hover:opacity-100"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 z-1 flex items-center justify-center",
                  "invisible group-hover:visible",
                  dragOver && "visible"
                )}
              >
                <Button
                  variant="glass"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(null)
                  }}
                  className="pointer-events-auto aspect-square cursor-pointer p-6"
                >
                  <CameraIcon className="size-6" />
                </Button>
              </div>
            </>
          ) : null}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        hidden
        onChange={onFile}
      />
    </div>
  )
}
