import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Textarea } from "@workspace/ui/components/textarea"
import { ApiError, api } from "../lib/api"
import type { ReportReason } from "../lib/api"

const REASONS: Array<{ value: ReportReason; label: string; help: string }> = [
  {
    value: "spam",
    label: "Spam",
    help: "Repeated unsolicited posts, scams, or self-promo",
  },
  {
    value: "harassment",
    label: "Harassment",
    help: "Targeted insults, threats, or intimidation",
  },
  {
    value: "csam",
    label: "Child sexual abuse material",
    help: "Sexual content involving minors. Reports here go to the top of the queue.",
  },
  {
    value: "violence",
    label: "Violence or self-harm",
    help: "Graphic violence, threats, or self-harm",
  },
  {
    value: "impersonation",
    label: "Impersonation",
    help: "Pretending to be someone they aren't",
  },
  {
    value: "illegal",
    label: "Illegal activity",
    help: "Promoting illegal goods or services",
  },
  { value: "other", label: "Other", help: "Doesn't fit the above" },
]

export function ReportDialog({
  open,
  onOpenChange,
  subjectType,
  subjectId,
  subjectLabel,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  subjectType: "post" | "user" | "article" | "message"
  subjectId: string
  /** Free-form short label of what's being reported, shown in the heading. */
  subjectLabel?: string
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  function close() {
    onOpenChange(false)
    // Reset after the dialog has closed so the next open starts blank.
    setTimeout(() => {
      setReason(null)
      setDetails("")
      setStatus(null)
    }, 150)
  }

  async function submit() {
    if (!reason || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await api.report({
        subjectType,
        subjectId,
        reason,
        details: details.trim().length > 0 ? details.trim() : undefined,
      })
      setStatus(
        res.deduped
          ? "You've already reported this — thanks. Mods will take a look."
          : "Reported. Thanks — mods will take a look."
      )
      setTimeout(close, 1200)
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "couldn't submit report")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Report{" "}
            {subjectLabel ? (
              <span className="font-normal text-muted-foreground">
                {subjectLabel}
              </span>
            ) : (
              "this"
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ul className="divide-y divide-border rounded-md border border-border">
            {REASONS.map((r) => (
              <li key={r.value}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition hover:bg-muted/30">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.help}
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Optional details for the moderation team"
            maxLength={1000}
            rows={3}
          />
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!reason || busy}>
              {busy ? "Sending…" : "Submit report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
