import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { handleSchema } from "@workspace/validators"
import { trackedAction } from "../lib/analytics"
import { ApiError, api } from "../lib/api"

export function ClaimHandle({
  onClaimed,
}: {
  onClaimed: (handle: string) => void
}) {
  const [handle, setHandle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = handleSchema.safeParse(handle)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "invalid handle")
      return
    }
    setLoading(true)
    try {
      const { user } = await trackedAction(
        "handle_claimed",
        () => api.claimHandle(handle),
        (res) => ({ handle: res.user.handle ?? handle }),
      )
      if (user.handle) onClaimed(user.handle)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "handle_taken") setError("that handle is taken")
        else if (err.code === "reserved_handle")
          setError("that handle is reserved")
        else setError(err.message)
      } else {
        setError("claim failed")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-md border border-border bg-muted/40 p-4">
      <h2 className="text-sm font-semibold">Claim your handle</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Your handle is permanent for v1. Choose something you'll be happy with.
      </p>
      <form onSubmit={onSubmit} className="mt-3 space-y-2">
        <div className="space-y-1">
          <Label htmlFor="claim-handle">Handle</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">@</span>
            <Input
              id="claim-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            3–20 chars · letters, numbers, underscore.
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "claiming…" : "Claim handle"}
        </Button>
      </form>
    </section>
  )
}
