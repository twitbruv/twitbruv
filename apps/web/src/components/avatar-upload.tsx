import { useRef, useState } from "react"
import { IconCamera, IconTrash } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
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

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div
          className={`size-20 overflow-hidden rounded-full ring-2 transition ${
            dragOver ? "ring-primary" : "ring-background"
          }`}
        >
          {currentUrl ? (
            <img
              src={currentUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-foreground/80 uppercase">
              {initial}
            </div>
          )}
        </div>
        <Button
          variant="default"
          size="icon"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -right-1 -bottom-1 rounded-full"
          aria-label="upload avatar"
        >
          <IconCamera className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-foreground">Avatar</span>
        <span className="text-muted-foreground">
          {uploading ? "uploading…" : "square images look best."}
        </span>
        {error && <span className="text-destructive">{error}</span>}
        {currentUrl && !uploading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            className="mt-1 self-start text-destructive hover:underline"
          >
            <IconTrash className="size-4" /> Remove
          </Button>
        )}
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
