import { useRef, useState } from "react"
import { CameraIcon, TrashIcon } from "@heroicons/react/24/solid"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { pickVariantUrl, uploadImage } from "../lib/media"

export function AvatarUpload({
  currentUrl,
  displayName,
  onChange,
}: {
  currentUrl: string | null
  displayName: string | null
  onChange: (nextUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const initial = (displayName ?? "·").slice(0, 1).toUpperCase()

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
      const url = pickVariantUrl(media, "thumb")
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

  const pickTarget = (
    <div
      className="relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div
        className={
          dragOver
            ? "group rounded-full p-1 ring-2 ring-focus"
            : "group rounded-full bg-base-1 p-1"
        }
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="upload avatar"
          className="focus-visible:ring-offset-base-1 relative block cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          <Avatar
            initial={initial}
            src={currentUrl}
            size="xl"
            className="size-28"
          />
          <span
            aria-hidden
            className={
              dragOver
                ? "absolute inset-0 rounded-full bg-base-1/30"
                : "absolute inset-0 rounded-full bg-base-1/0 transition-[opacity,background-color] duration-100 ease-out group-hover:bg-base-1/10"
            }
          />
          <span
            className={
              dragOver || uploading
                ? "absolute inset-0 z-1 flex scale-100 items-center justify-center opacity-100 transition-[opacity,scale] duration-100 ease-out"
                : "invisible absolute inset-0 z-1 flex scale-95 items-center justify-center opacity-0 transition-[opacity,scale] duration-100 ease-out group-hover:visible group-hover:scale-100 group-hover:opacity-100"
            }
          >
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-sm">
              {uploading ? (
                <Spinner className="size-4 text-inherit" />
              ) : (
                <CameraIcon className="size-4 text-inherit" />
              )}
            </span>
          </span>
        </button>
      </div>
      {currentUrl && (
        <Button
          variant="outline"
          size="md"
          onClick={() => onChange(null)}
          disabled={uploading}
          className={
            uploading
              ? "pointer-events-none absolute right-0 bottom-0 rounded-full p-1 text-danger opacity-0"
              : "absolute right-0 bottom-0 rounded-full p-1 text-danger hover:bg-base-2"
          }
          aria-label="remove avatar"
        >
          <TrashIcon className="size-4" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="shrink-0">
      {pickTarget}
      {error ? (
        <div className="mt-2 text-xs">
          <p className="text-danger">{error}</p>
        </div>
      ) : null}
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
