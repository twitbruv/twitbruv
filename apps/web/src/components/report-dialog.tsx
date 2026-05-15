import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
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
              <span className="font-normal text-tertiary">{subjectLabel}</span>
            ) : (
              "this"
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <RadioGroup<ReportReason | null>
            value={reason}
            onValueChange={(value) => setReason(value)}
          >
            <ul className="overflow-hidden rounded-md bg-base-2 shadow-field">
              {REASONS.map((r) => (
                <li key={r.value}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-subtle/60">
                    <RadioGroupItem value={r.value} />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-primary">
                        {r.label}
                      </span>
                      <span className="ml-1.5 text-tertiary">{r.help}</span>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </RadioGroup>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Optional details for the moderation team"
            maxLength={1000}
            rows={3}
            className="text-sm"
          />
          {status && <p className="text-sm text-secondary">{status}</p>}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="transparent"
              onClick={close}
              disabled={busy}
            >
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
