import { useRef, useState } from "react"
import { IconPhoto, IconX } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { compressImage, uploadImage } from "../lib/media"

/**
 * Single-image cover picker. Hands the parent the resulting media id once upload finishes.
 * Initial preview can be supplied (for the edit page where a cover already exists).
 */
export function CoverPicker({
  initialUrl = null,
  onChange,
}: {
  initialUrl?: string | null
  onChange: (mediaId: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("only image files")
      return
    }
    setBusy(true)
    setError(null)
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    try {
      const compressed = await compressImage(file)
      const uploaded = await uploadImage(compressed)
      onChange(uploaded.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed")
      setPreview(initialUrl)
    } finally {
      URL.revokeObjectURL(localUrl)
      setBusy(false)
    }
  }

  function clear() {
    setPreview(null)
    onChange(null)
  }

  return (
    <div className="space-y-1">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick(file)
          e.target.value = ""
        }}
      />
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="cover preview"
            className="aspect-[3/1] w-full rounded-md object-cover"
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={clear}
            aria-label="remove cover"
            className="absolute top-2 right-2 size-7 rounded-full bg-background/80 backdrop-blur-sm"
          >
            <IconX size={14} />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex aspect-[3/1] w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-xs text-muted-foreground transition hover:bg-muted/30"
        >
          <IconPhoto size={20} stroke={1.5} />
          <span>{busy ? "uploading…" : "Add cover image"}</span>
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
