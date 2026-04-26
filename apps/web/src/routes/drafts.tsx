import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { ApiError, api } from "../lib/api"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { PageEmpty, PageError, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import {
  UnderlineTabButton,
  UnderlineTabRow,
} from "../components/underline-tab-row"
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
      const { items: next } = await api.scheduledPosts(
        tab === "drafts" ? "draft" : "scheduled"
      )
      setItems(next)
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
  const appHeader = useMemo(
    () => ({
      title: "Drafts & scheduled" as const,
    }),
    []
  )
  usePageHeader(appHeader)

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
    <PageFrame>
      <main>
        <UnderlineTabRow>
          {(["drafts", "scheduled"] as Array<Tab>).map((t) => (
            <UnderlineTabButton
              key={t}
              active={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "drafts" ? "Drafts" : "Scheduled"}
            </UnderlineTabButton>
          ))}
        </UnderlineTabRow>

        {error && <PageError message={error} />}

        {items === null ? (
          <PageLoading label="Loading…" />
        ) : items.length === 0 ? (
          <PageEmpty
            title={tab === "drafts" ? "No drafts yet" : "No scheduled posts"}
            description={
              tab === "drafts"
                ? "Compose a post and save it as a draft, or schedule one for later."
                : "Schedule a draft to see it here."
            }
          />
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
    </PageFrame>
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
    item.scheduledFor ? toLocalInput(item.scheduledFor) : ""
  )

  return (
    <li className="px-4 py-3">
      <p className="text-sm break-words whitespace-pre-wrap">
        {item.text || (
          <span className="text-muted-foreground">(empty draft)</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {tab === "scheduled" && item.scheduledFor
            ? `Scheduled for ${new Date(item.scheduledFor).toLocaleString()}`
            : `Saved ${new Date(item.createdAt).toLocaleString()}`}
        </span>
        <div className="flex items-center gap-1">
          {!editing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Schedule
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onPublish} disabled={busy}>
            Post now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy}
            className="text-destructive"
          >
            Delete
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Input
            type="datetime-local"
            value={scheduleAt}
            min={toLocalInput(new Date(Date.now() + 90_000).toISOString())}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="h-8 w-auto min-w-44 text-xs"
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
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

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
