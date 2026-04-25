import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import type { ScheduledPost } from "../lib/api"

export const Route = createFileRoute("/drafts")({ component: Drafts })

type Tab = "drafts" | "scheduled"

function Drafts() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [tab, setTab] = useState<Tab>("drafts")
  const [items, setItems] = useState<Array<ScheduledPost> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const { items } = await api.scheduledPosts(tab === "drafts" ? "draft" : "scheduled")
      setItems(items)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "load failed")
      setItems([])
    }
  }, [tab])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function publish(id: string) {
    setBusyId(id)
    try {
      await api.publishScheduledPost(id)
      await refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "publish failed")
    } finally {
      setBusyId(null)
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this draft?")) return
    setBusyId(id)
    try {
      await api.deleteScheduledPost(id)
      await refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "delete failed")
    } finally {
      setBusyId(null)
    }
  }
  async function reschedule(id: string, scheduledFor: string | null) {
    setBusyId(id)
    try {
      await api.updateScheduledPost(id, { scheduledFor })
      await refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "update failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main>
      <header className="border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold">Drafts &amp; scheduled</h1>
        <p className="text-xs text-muted-foreground">
          Drafts are private. Scheduled posts publish automatically at the chosen time.
        </p>
      </header>
      <div className="flex border-b border-border">
        {(["drafts", "scheduled"] as Array<Tab>).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "drafts" ? "Drafts" : "Scheduled"}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {items === null ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">loading…</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {tab === "drafts" ? "no drafts saved yet." : "no scheduled posts."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <DraftRow
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onPublish={() => publish(item.id)}
              onDelete={() => remove(item.id)}
              onReschedule={(t) => reschedule(item.id, t)}
              tab={tab}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

function DraftRow({
  item,
  busy,
  tab,
  onPublish,
  onDelete,
  onReschedule,
}: {
  item: ScheduledPost
  busy: boolean
  tab: Tab
  onPublish: () => void
  onDelete: () => void
  onReschedule: (scheduledFor: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [scheduleAt, setScheduleAt] = useState<string>(
    item.scheduledFor ? toLocalInput(item.scheduledFor) : "",
  )

  return (
    <li className="px-4 py-3">
      <p className="whitespace-pre-wrap break-words text-sm">
        {item.text || <span className="text-muted-foreground">(empty draft)</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {tab === "scheduled" && item.scheduledFor
            ? `Scheduled for ${new Date(item.scheduledFor).toLocaleString()}`
            : `Saved ${new Date(item.createdAt).toLocaleString()}`}
        </span>
        <div className="flex items-center gap-1">
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
              Schedule
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onPublish} disabled={busy}>
            Post now
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className="text-destructive">
            Delete
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            type="datetime-local"
            value={scheduleAt}
            min={toLocalInput(new Date(Date.now() + 90_000).toISOString())}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1"
          />
          <Button
            size="sm"
            disabled={busy || !scheduleAt}
            onClick={() => {
              const iso = new Date(scheduleAt).toISOString()
              onReschedule(iso)
              setEditing(false)
            }}
          >
            Save
          </Button>
          {item.scheduledFor && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onReschedule(null)
                setEditing(false)
              }}
              disabled={busy}
            >
              Move to drafts
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}
      {item.failureReason && (
        <p className="mt-2 text-xs text-destructive">
          Last attempt failed: {item.failureReason}
        </p>
      )}
    </li>
  )
}

// "datetime-local" input expects "YYYY-MM-DDTHH:mm" in the user's local time, NOT a UTC ISO.
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
