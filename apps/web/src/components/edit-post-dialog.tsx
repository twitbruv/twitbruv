import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Textarea } from "@workspace/ui/components/textarea"
import { POST_MAX_LEN } from "@workspace/validators"
import { ApiError, api } from "../lib/api"
import type { Post } from "../lib/api"

export function EditPostDialog({
  post,
  open,
  onOpenChange,
  onSaved,
}: {
  post: Post
  open: boolean
  onOpenChange: (next: boolean) => void
  onSaved: (next: Post) => void
}) {
  const [text, setText] = useState(post.text)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setText(post.text)
      setError(null)
    }
  }, [open, post.text])

  async function save() {
    if (busy) return
    if (text.trim().length === 0 || text.length > POST_MAX_LEN) {
      setError("invalid length")
      return
    }
    if (text === post.text) {
      onOpenChange(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { post: updated } = await api.editPost(post.id, text)
      onSaved(updated)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "edit failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={POST_MAX_LEN}
          className="min-h-24 text-sm"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span
            className={
              text.length > POST_MAX_LEN
                ? "text-destructive"
                : "text-muted-foreground"
            }
          >
            {POST_MAX_LEN - text.length}
          </span>
          <div className="flex items-center gap-2">
            {error && <span className="text-destructive">{error}</span>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
