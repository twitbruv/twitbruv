import { useEffect, useState } from "react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import type { PollDto } from "../lib/api"

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "Final results"
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s left`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m left`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h left`
  const days = Math.floor(hr / 24)
  return `${days}d left`
}

export function PollBlock({
  poll,
  onChange,
}: {
  poll: PollDto
  onChange?: (poll: PollDto) => void
}) {
  const { data: session } = authClient.useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Recompute closed-state on a 30s tick so the UI flips when the poll expires.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(iv)
  }, [])

  const closesAt = new Date(poll.closesAt).getTime()
  const closed = poll.closed || closesAt <= now
  const hasVoted = (poll.viewerVoteOptionIds?.length ?? 0) > 0
  // Show results if voted, closed, or the viewer is anonymous (no point hiding from them).
  const showResults = closed || hasVoted || !session

  function toggle(optionId: string) {
    if (poll.allowMultiple) {
      const next = new Set(selected)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      setSelected(next)
    } else {
      setSelected(new Set([optionId]))
    }
  }

  async function submit() {
    if (busy || selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const optionIds = [...selected]
      await api.votePoll(poll.id, optionIds)
      // Optimistically update the poll: bump counts, mark viewer's vote, increment total.
      const optionSet = new Set(optionIds)
      onChange?.({
        ...poll,
        totalVotes: poll.totalVotes + optionIds.length,
        viewerVoteOptionIds: optionIds,
        options: poll.options.map((o) =>
          optionSet.has(o.id) ? { ...o, voteCount: o.voteCount + 1 } : o
        ),
      })
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "vote failed")
    } finally {
      setBusy(false)
    }
  }

  const optionsList = (
    <ul className="space-y-1.5">
      {poll.options.map((opt) => {
        const pct =
          poll.totalVotes > 0 ? (opt.voteCount / poll.totalVotes) * 100 : 0
        const isViewerChoice =
          poll.viewerVoteOptionIds?.includes(opt.id) ?? false
        const isSelected = selected.has(opt.id)
        if (showResults) {
          return (
            <li key={opt.id}>
              <div className="relative overflow-hidden rounded-md border border-border">
                <div
                  className={`absolute inset-y-0 left-0 ${isViewerChoice ? "bg-primary/30" : "bg-muted"}`}
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {isViewerChoice && <span className="text-primary">✓</span>}
                    {opt.text}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            </li>
          )
        }
        return (
          <li key={opt.id}>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:bg-muted/40 ${
                isSelected ? "border-primary" : "border-border"
              }`}
            >
              {poll.allowMultiple ? (
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(opt.id)}
                />
              ) : (
                <RadioGroupItem value={opt.id} />
              )}
              <span>{opt.text}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="mt-2 rounded-md border border-border p-3">
      {!showResults && !poll.allowMultiple ? (
        <RadioGroup
          value={[...selected][0] ?? ""}
          onValueChange={(value: string) => setSelected(new Set([value]))}
          className="contents"
        >
          {optionsList}
        </RadioGroup>
      ) : (
        optionsList
      )}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} ·{" "}
          {formatTimeLeft(closesAt - now)}
        </span>
        {!showResults && (
          <button
            type="button"
            onClick={submit}
            disabled={busy || selected.size === 0}
            className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Voting…" : "Vote"}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
