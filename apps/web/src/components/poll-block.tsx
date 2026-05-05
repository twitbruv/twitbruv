import { CheckIcon } from "@heroicons/react/16/solid"
import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { cn } from "@workspace/ui/lib/utils"
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
  const [animate, setAnimate] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(iv)
  }, [])

  const closesAt = new Date(poll.closesAt).getTime()
  const closed = poll.closed || closesAt <= now
  const hasVoted = (poll.viewerVoteOptionIds?.length ?? 0) > 0
  const showResults = closed || hasVoted || !session

  useEffect(() => {
    if (showResults && !animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimate(true))
      })
    }
  }, [showResults, animate])

  function toggleMulti(optionId: string) {
    const next = new Set(selected)
    if (next.has(optionId)) next.delete(optionId)
    else next.add(optionId)
    setSelected(next)
  }

  async function vote(optionIds: Array<string>) {
    if (busy || optionIds.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api.votePoll(poll.id, optionIds)
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

  return (
    <div data-post-card-ignore-open className="mt-2">
      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt) => {
          const pct =
            poll.totalVotes > 0 ? (opt.voteCount / poll.totalVotes) * 100 : 0
          const isViewerChoice =
            poll.viewerVoteOptionIds?.includes(opt.id) ?? false

          if (showResults) {
            return (
              <div
                key={opt.id}
                className="relative overflow-hidden rounded-lg border border-transparent"
              >
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ease-out-expo",
                    isViewerChoice ? "bg-inverse/10" : "bg-subtle"
                  )}
                  style={{ width: animate ? `${pct}%` : "0%" }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-primary">
                    {isViewerChoice && (
                      <CheckIcon className="size-4 shrink-0 text-primary" />
                    )}
                    {opt.text}
                  </span>
                  <span className="shrink-0 text-sm text-tertiary tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            )
          }

          if (poll.allowMultiple) {
            const isSelected = selected.has(opt.id)
            return (
              <label
                key={opt.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-primary transition-colors duration-150",
                  isSelected
                    ? "border-neutral-strong bg-subtle"
                    : "border-neutral bg-base-2 hover:bg-subtle"
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleMulti(opt.id)}
                />
                <span>{opt.text}</span>
              </label>
            )
          }

          return (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => vote([opt.id])}
              className={cn(
                "rounded-lg border border-neutral bg-base-2 px-3 py-2 text-left text-sm text-primary transition-colors duration-150",
                "hover:border-neutral-strong hover:bg-subtle",
                "active:scale-[0.99]",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              {opt.text}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-tertiary">
          {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} ·{" "}
          {formatTimeLeft(closesAt - now)}
        </span>
        {!showResults && poll.allowMultiple && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => vote([...selected])}
            disabled={busy || selected.size === 0}
            loading={busy}
          >
            Vote
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
