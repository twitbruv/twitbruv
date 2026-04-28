import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { ApiError, api } from "../lib/api"
import { feedLikePredicate } from "../lib/query-cache"
import { qk } from "../lib/query-keys"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { PageEmpty, PageError, PageLoading } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import type { ScheduledPost } from "../lib/api"

export const Route = createFileRoute("/drafts")({ component: Drafts })

type Tab = "drafts" | "scheduled"

function Drafts() {
  const { data: session, isPending } = authClient.useSession()
  const router = useRouter()
  const qc = useQueryClient()
  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const [tab, setTab] = useState<Tab>("drafts")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const kind = tab === "drafts" ? "draft" : "scheduled"
  const {
    data: items = [],
    error: itemsErr,
    isPending: itemsPending,
  } = useQuery({
    queryKey: qk.scheduled(kind),
    queryFn: async () => (await api.scheduledPosts(kind)).items,
    enabled: !!session,
  })

  const error =
    itemsErr instanceof ApiError
      ? itemsErr.message
      : itemsErr
        ? "load failed"
        : null

  async function invalidateScheduled() {
    await qc.invalidateQueries({ queryKey: qk.scheduled("draft") })
    await qc.invalidateQueries({ queryKey: qk.scheduled("scheduled") })
  }

  async function publish(id: string) {
    setBusyId(id)
    setActionError(null)
    try {
      await api.publishScheduledPost(id)
      await invalidateScheduled()
      await qc.invalidateQueries({ predicate: feedLikePredicate })
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "publish failed")
    } finally {
      setBusyId(null)
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this draft?")) return
    setBusyId(id)
    setActionError(null)
    try {
      await api.deleteScheduledPost(id)
      await invalidateScheduled()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "delete failed")
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
    setActionError(null)
    try {
      await api.updateScheduledPost(id, { scheduledFor })
      await invalidateScheduled()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "update failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageFrame>
      <header className="sticky top-0 z-40 flex h-12 items-center bg-base-1/80 px-4 backdrop-blur-md">
        <SegmentedControl<Tab>
          layout="fit"
          variant="ghost"
          value={tab}
          options={[
            { value: "drafts", label: "Drafts" },
            { value: "scheduled", label: "Scheduled" },
          ]}
          onValueChange={(value) => setTab(value)}
        />
      </header>

      {(error || actionError) && (
        <PageError message={(error ?? actionError)!} />
      )}

      {itemsPending ? (
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
        <ul className="divide-border divide-y">
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
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {tab === "scheduled" && item.scheduledFor
            ? `Scheduled for ${new Date(item.scheduledFor).toLocaleString()}`
            : `Saved ${new Date(item.createdAt).toLocaleString()}`}
        </span>
        <div className="flex items-center gap-1">
          {!editing && (
            <Button
              size="sm"
              variant="transparent"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Schedule
            </Button>
          )}
          <Button
            size="sm"
            variant="transparent"
            onClick={onPublish}
            disabled={busy}
          >
            Post now
          </Button>
          <Button
            size="sm"
            variant="transparent"
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
              variant="transparent"
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
            variant="transparent"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      )}
      {item.failureReason && (
        <p className="text-destructive mt-2 text-xs">
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
