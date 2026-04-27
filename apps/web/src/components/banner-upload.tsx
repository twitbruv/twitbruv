import { useRef, useState } from "react"
import { CameraIcon, TrashIcon } from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { pickVariantUrl, uploadImage } from "../lib/media"

export function BannerUpload({
  currentUrl,
  onChange,
}: {
  currentUrl: string | null
  onChange: (nextUrl: string | null) => void
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary">Banner</span>
        <div className="flex items-center gap-3 text-xs">
          {uploading && (
            <span className="text-tertiary">uploading…</span>
          )}
          {error && <span className="text-danger">{error}</span>}
          {currentUrl && !uploading && (
            <Button
              variant="transparent"
              size="sm"
              onClick={() => onChange(null)}
              className="text-danger hover:underline"
            >
              <TrashIcon className="size-4" /> Remove
            </Button>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="md"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPaste={onPaste}
        className={`group relative block h-36 w-full overflow-hidden rounded-md border bg-base-2 transition ${
          dragOver ? "border-accent ring-2 ring-accent" : "border-neutral"
        }`}
        aria-label="upload banner"
      >
        {currentUrl ? (
          <img src={currentUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-tertiary">
            {dragOver
              ? "drop image to upload"
              : "click to upload a banner image (wide is better)"}
          </div>
        )}
        <div
          className={`absolute inset-0 flex items-center justify-center transition ${
            dragOver
              ? "bg-accent/10 opacity-100"
              : "bg-base-1/0 opacity-0 group-hover:bg-base-1/30 group-hover:opacity-100"
          }`}
        >
          <CameraIcon className="size-4" />
        </div>
      </Button>
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
